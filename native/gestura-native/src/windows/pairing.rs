use std::{ffi::c_void, fs, mem::size_of, os::windows::fs::MetadataExt, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree},
    Security::{
        Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
        },
        DACL_SECURITY_INFORMATION, GetTokenInformation, PROTECTED_DACL_SECURITY_INFORMATION,
        SetFileSecurityW, TOKEN_QUERY, TOKEN_USER, TokenUser,
    },
    System::Threading::{GetCurrentProcess, OpenProcessToken},
};
pub fn protect_directory(path: &str) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_dir() || metadata.file_attributes() & 0x400 != 0 {
        return Err("Pairing path must not be a reparse point".into());
    }
    // SAFETY: Handles/LocalAlloc results are released on each path. The token
    // buffer is aligned to usize and remains alive while its SID is read.
    unsafe {
        let mut token = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err("Cannot open current user token".into());
        }
        let mut size = 0;
        GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut size);
        let mut data = vec![0usize; (size as usize).div_ceil(size_of::<usize>())];
        let ok = GetTokenInformation(token, TokenUser, data.as_mut_ptr().cast(), size, &mut size);
        CloseHandle(token);
        if ok == 0 {
            return Err("Cannot read current user SID".into());
        }
        let user = &*(data.as_ptr().cast::<TOKEN_USER>());
        let mut sid = ptr::null_mut();
        if ConvertSidToStringSidW(user.User.Sid, &mut sid) == 0 {
            return Err("Cannot format user SID".into());
        }
        let mut len = 0;
        while *sid.add(len) != 0 {
            len += 1;
        }
        let user_sid = String::from_utf16_lossy(std::slice::from_raw_parts(sid, len));
        LocalFree(sid.cast::<c_void>());
        // Protected DACL, no inherited ACEs: only this user, inherited by new files.
        let sddl: Vec<u16> = format!("D:P(A;OICI;FA;;;{user_sid})")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut descriptor = ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            ptr::null_mut(),
        ) == 0
        {
            return Err("Cannot create private pairing ACL".into());
        }
        let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
        let result = SetFileSecurityW(
            wide.as_ptr(),
            DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
            descriptor,
        );
        LocalFree(descriptor);
        if result == 0 {
            return Err("Cannot protect pairing directory".into());
        }
    }
    Ok(())
}
