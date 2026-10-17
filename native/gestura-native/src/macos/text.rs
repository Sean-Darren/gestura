use crate::{input::InputResult, ui::FocusedText};
use core_foundation::{
    base::{CFRelease, CFTypeRef, TCFType},
    string::CFString,
};
use std::{
    ffi::c_void,
    ptr,
    time::{Duration, Instant},
};
type Ax = *const c_void;
#[repr(C)]
#[derive(Clone, Copy, PartialEq)]
struct Range {
    location: isize,
    length: isize,
}
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementCreateSystemWide() -> Ax;
    fn AXUIElementCopyAttributeValue(element: Ax, key: CFTypeRef, result: *mut CFTypeRef) -> i32;
    fn AXUIElementCopyParameterizedAttributeValue(
        element: Ax,
        key: CFTypeRef,
        parameter: CFTypeRef,
        result: *mut CFTypeRef,
    ) -> i32;
    fn AXUIElementSetAttributeValue(element: Ax, key: CFTypeRef, value: CFTypeRef) -> i32;
    fn AXUIElementIsAttributeSettable(element: Ax, key: CFTypeRef, value: *mut bool) -> i32;
    fn AXUIElementGetPid(element: Ax, pid: *mut i32) -> i32;
    fn AXUIElementSetMessagingTimeout(element: Ax, timeout: f32) -> i32;
    fn AXValueGetValue(value: CFTypeRef, kind: u32, result: *mut c_void) -> bool;
    fn AXValueCreate(kind: u32, value: *const c_void) -> CFTypeRef;
    fn AXValueGetTypeID() -> usize;
}
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFEqual(a: CFTypeRef, b: CFTypeRef) -> bool;
    fn CFGetTypeID(value: CFTypeRef) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFBooleanGetTypeID() -> usize;
    fn CFBooleanGetValue(value: CFTypeRef) -> bool;
}
#[link(name = "proc")]
unsafe extern "C" {
    fn proc_pidpath(pid: i32, buffer: *mut c_void, size: u32) -> i32;
}
struct Owned(CFTypeRef);
impl Drop for Owned {
    fn drop(&mut self) {
        unsafe { CFRelease(self.0) }
    }
}
impl Owned {
    fn attr(&self, name: &str) -> Option<Self> {
        let key = CFString::new(name);
        let mut result = ptr::null();
        if unsafe { AXUIElementCopyAttributeValue(self.0, key.as_CFTypeRef(), &mut result) } == 0
            && !result.is_null()
        {
            Some(Self(result))
        } else {
            None
        }
    }
    fn string(&self) -> Option<String> {
        if unsafe { CFGetTypeID(self.0) != CFStringGetTypeID() } {
            return None;
        }
        let text = unsafe { CFString::wrap_under_get_rule(self.0.cast()) }.to_string();
        (text.encode_utf16().count() <= 10000 && !text.contains('\0')).then_some(text)
    }
    fn boolean(&self, name: &str) -> bool {
        self.attr(name).is_some_and(|value| unsafe {
            CFGetTypeID(value.0) == CFBooleanGetTypeID() && CFBooleanGetValue(value.0)
        })
    }
    fn range(&self) -> Option<Range> {
        let value = self.attr("AXSelectedTextRange")?;
        if unsafe { CFGetTypeID(value.0) != AXValueGetTypeID() } {
            return None;
        }
        let mut range = Range {
            location: 0,
            length: 0,
        };
        (unsafe { AXValueGetValue(value.0, 4, (&mut range as *mut Range).cast()) }
            && range.location >= 0
            && range.length >= 0)
            .then_some(range)
    }
}
fn focused() -> Option<Owned> {
    if !super::PlatformInput::has_permission() {
        return None;
    }
    let system = Owned(unsafe { AXUIElementCreateSystemWide() });
    if system.0.is_null() {
        std::mem::forget(system);
        return None;
    }
    unsafe {
        AXUIElementSetMessagingTimeout(system.0, 0.01);
    }
    let app = system.attr("AXFocusedApplication")?;
    let mut pid = 0;
    if unsafe { AXUIElementGetPid(app.0, &mut pid) } != 0 || pid as u32 == std::process::id() {
        return None;
    }
    let mut path = [0u8; 4096];
    if unsafe { proc_pidpath(pid, path.as_mut_ptr().cast(), path.len() as u32) } <= 0 {
        return None;
    }
    let end = path.iter().position(|c| *c == 0).unwrap_or(path.len());
    if crate::ui::unsafe_text_host(&String::from_utf8_lossy(&path[..end])) {
        return None;
    }
    let field = app.attr("AXFocusedUIElement")?;
    let role = field.attr("AXRole")?.string()?;
    let subrole = field
        .attr("AXSubrole")
        .and_then(|r| r.string())
        .unwrap_or_default();
    let key = CFString::new("AXValue");
    let mut writable = false;
    if !matches!(role.as_str(), "AXTextField" | "AXTextArea" | "AXComboBox")
        || subrole.contains("Secure")
        || !field.boolean("AXEnabled")
        || !field.boolean("AXFocused")
        || unsafe { AXUIElementIsAttributeSettable(field.0, key.as_CFTypeRef(), &mut writable) }
            != 0
        || !writable
    {
        return None;
    }
    let range_key = CFString::new("AXSelectedTextRange");
    let mut selectable = false;
    if unsafe { AXUIElementIsAttributeSettable(field.0, range_key.as_CFTypeRef(), &mut selectable) }
        != 0
        || !selectable
    {
        return None;
    }
    Some(field)
}
struct Snapshot {
    token: String,
    field: Owned,
    range: Range,
    selected: String,
    created: Instant,
}
#[derive(Default)]
pub struct Backend {
    snapshot: Option<Snapshot>,
}
impl Backend {
    pub fn capture(&mut self, token: &str) -> InputResult<Option<FocusedText>> {
        self.snapshot = None;
        let Some(field) = focused() else {
            return Ok(None);
        };
        let Some(range) = field.range() else {
            return Ok(None);
        };
        let selected = if range.length == 0 {
            String::new()
        } else {
            let Some(text) = field.attr("AXSelectedText").and_then(|s| s.string()) else {
                return Ok(None);
            };
            text
        };
        if selected.encode_utf16().count() as isize != range.length {
            return Ok(None);
        }
        self.snapshot = Some(Snapshot {
            token: token.into(),
            field,
            range,
            selected: selected.clone(),
            created: Instant::now(),
        });
        Ok(Some(FocusedText {
            token: token.into(),
            selected_text: selected,
        }))
    }
    pub fn check(
        &mut self,
        token: &str,
        text: &str,
        after: bool,
        select: bool,
    ) -> InputResult<bool> {
        let Some(snapshot) = &mut self.snapshot else {
            return Ok(false);
        };
        if snapshot.token != token || snapshot.created.elapsed() >= Duration::from_secs(60) {
            return Ok(false);
        }
        let Some(field) = focused() else {
            return Ok(false);
        };
        if !unsafe { CFEqual(field.0, snapshot.field.0) } {
            return Ok(false);
        }
        let Some(current) = field.range() else {
            return Ok(false);
        };
        if !after {
            let selected = if current.length == 0 {
                Some(String::new())
            } else {
                field.attr("AXSelectedText").and_then(|s| s.string())
            };
            return Ok(current == snapshot.range && selected.as_ref() == Some(&snapshot.selected));
        }
        if current.length != 0
            || current.location < snapshot.range.location
            || current.location - snapshot.range.location > 20000
        {
            return Ok(false);
        }
        let range = Range {
            location: snapshot.range.location,
            length: current.location - snapshot.range.location,
        };
        let value = Owned(unsafe { AXValueCreate(4, (&range as *const Range).cast()) });
        if value.0.is_null() {
            std::mem::forget(value);
            return Ok(false);
        }
        let mut result = ptr::null();
        let key = CFString::new("AXStringForRange");
        if unsafe {
            AXUIElementCopyParameterizedAttributeValue(
                field.0,
                key.as_CFTypeRef(),
                value.0,
                &mut result,
            )
        } != 0
            || result.is_null()
        {
            return Ok(false);
        }
        let Some(actual) = Owned(result).string() else {
            return Ok(false);
        };
        if actual.replace("\r\n", "\n") != text.replace("\r\n", "\n") {
            return Ok(false);
        }
        if select {
            let key = CFString::new("AXSelectedTextRange");
            if unsafe { AXUIElementSetAttributeValue(field.0, key.as_CFTypeRef(), value.0) } != 0 {
                return Ok(false);
            }
            snapshot.range = range;
            snapshot.selected = actual;
        }
        Ok(true)
    }
}
