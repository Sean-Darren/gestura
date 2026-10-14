use crate::input::*;
use std::{mem::size_of, ptr};
use windows_sys::Win32::{
    Foundation::{LPARAM, POINT, RECT},
    Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
    },
    UI::{
        HiDpi::{
            DPI_AWARENESS_CONTEXT, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
            SetThreadDpiAwarenessContext,
        },
        Input::KeyboardAndMouse::*,
        Shell::GetScaleFactorForMonitor,
        WindowsAndMessaging::{
            GetPhysicalCursorPos, GetSystemMetrics, MONITORINFOF_PRIMARY, SM_CXVIRTUALSCREEN,
            SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        },
    },
};

struct DpiScope(DPI_AWARENESS_CONTEXT);
impl DpiScope {
    fn enter() -> InputResult<Self> {
        // SAFETY: Only the calling thread's DPI context changes and Drop restores it.
        let previous =
            unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        if previous.is_null() {
            return Err("Could not set per-monitor DPI context".into());
        }
        Ok(Self(previous))
    }
}
impl Drop for DpiScope {
    fn drop(&mut self) {
        unsafe {
            SetThreadDpiAwarenessContext(self.0);
        }
    }
}

pub struct PlatformInput;
impl PlatformInput {
    pub fn new() -> InputResult<Self> {
        Ok(Self)
    }
    pub fn has_permission() -> bool {
        true
    }
    pub fn request_permission() -> bool {
        true
    }
    pub fn displays() -> InputResult<Vec<Display>> {
        let _dpi = DpiScope::enter()?;
        let mut result = MonitorCollection {
            displays: Vec::new(),
            error: None,
        };
        // SAFETY: The callback is synchronous and the collection remains alive throughout enumeration.
        let success = unsafe {
            EnumDisplayMonitors(
                ptr::null_mut(),
                ptr::null(),
                Some(collect_monitor),
                &raw mut result as LPARAM,
            )
        };
        if let Some(error) = result.error {
            return Err(error);
        }
        if success == 0 {
            return Err("Display enumeration failed".into());
        }
        Ok(result.displays)
    }
}

impl InputBackend for PlatformInput {
    fn move_to(&mut self, x: f64, y: f64) -> InputResult<()> {
        let _dpi = DpiScope::enter()?;
        // SAFETY: These metric queries have no pointer arguments.
        let (left, top, width, height) = unsafe {
            (
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                GetSystemMetrics(SM_CYVIRTUALSCREEN),
            )
        };
        send(&[mouse_event(
            MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
            normalize_axis(x, left, width)?,
            normalize_axis(y, top, height)?,
            0,
        )])
    }
    fn mouse_down(&mut self, button: Button) -> InputResult<()> {
        send(&[mouse_event(button_flag(button, true), 0, 0, 0)])
    }
    fn mouse_up(&mut self, button: Button) -> InputResult<()> {
        send(&[mouse_event(button_flag(button, false), 0, 0, 0)])
    }
    fn click(&mut self, button: Button) -> InputResult<()> {
        let result = send(&[
            mouse_event(button_flag(button, true), 0, 0, 0),
            mouse_event(button_flag(button, false), 0, 0, 0),
        ]);
        if result.is_err() {
            let _ = self.mouse_up(button);
        }
        result
    }
    fn double_click(&mut self) -> InputResult<()> {
        let result = send(&[
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0),
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0),
            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0),
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0),
        ]);
        if result.is_err() {
            let _ = self.mouse_up(Button::Left);
        }
        result
    }
    fn scroll(&mut self, dx: i32, dy: i32) -> InputResult<()> {
        let mut inputs = Vec::with_capacity(2);
        if dx != 0 {
            inputs.push(mouse_event(MOUSEEVENTF_HWHEEL, 0, 0, (dx * 120) as u32));
        }
        if dy != 0 {
            inputs.push(mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (-dy * 120) as u32));
        }
        send(&inputs)
    }
    fn type_text(&mut self, text: &str) -> InputResult<()> {
        send(&unicode_inputs(text))
    }
    fn key_combo(&mut self, keys: &[Key]) -> InputResult<()> {
        let virtual_keys = keys
            .iter()
            .map(virtual_key)
            .collect::<InputResult<Vec<_>>>()?;
        let press = virtual_keys
            .iter()
            .map(|&(key, flags)| keyboard_event(key, 0, flags));
        let release: Vec<INPUT> = virtual_keys
            .iter()
            .rev()
            .map(|&(key, flags)| keyboard_event(key, 0, flags | KEYEVENTF_KEYUP))
            .collect();
        let inputs: Vec<INPUT> = press.chain(release.iter().copied()).collect();
        let result = send(&inputs);
        if result.is_err() {
            let _ = send(&release);
        }
        result
    }
    fn cursor_pos(&self) -> InputResult<Point> {
        let mut point = POINT::default();
        // SAFETY: The output pointer refers to a live POINT.
        if unsafe { GetPhysicalCursorPos(&raw mut point) } == 0 {
            return Err("Could not read cursor position".into());
        }
        Ok(Point {
            x: f64::from(point.x),
            y: f64::from(point.y),
        })
    }
}

fn send(inputs: &[INPUT]) -> InputResult<()> {
    if inputs.is_empty() {
        return Ok(());
    }
    let count = u32::try_from(inputs.len()).map_err(|e| e.to_string())?;
    // SAFETY: The buffer has count initialized INPUT elements of the documented size.
    let sent = unsafe { SendInput(count, inputs.as_ptr(), size_of::<INPUT>() as i32) };
    if sent != count {
        return Err(format!(
            "SendInput accepted {sent}/{count} events (possibly blocked by UIPI): {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}
fn mouse_event(flags: u32, x: i32, y: i32, data: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: x,
                dy: y,
                mouseData: data,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}
fn keyboard_event(key: u16, scan: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}
fn unicode_inputs(text: &str) -> Vec<INPUT> {
    let mut inputs = Vec::with_capacity(text.len() * 2);
    for unit in text.encode_utf16() {
        inputs.push(keyboard_event(0, unit, KEYEVENTF_UNICODE));
        inputs.push(keyboard_event(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
    }
    inputs
}
fn button_flag(button: Button, down: bool) -> u32 {
    match (button, down) {
        (Button::Left, true) => MOUSEEVENTF_LEFTDOWN,
        (Button::Left, false) => MOUSEEVENTF_LEFTUP,
        (Button::Right, true) => MOUSEEVENTF_RIGHTDOWN,
        (Button::Right, false) => MOUSEEVENTF_RIGHTUP,
        (Button::Middle, true) => MOUSEEVENTF_MIDDLEDOWN,
        (Button::Middle, false) => MOUSEEVENTF_MIDDLEUP,
    }
}
fn normalize_axis(value: f64, origin: i32, extent: i32) -> InputResult<i32> {
    if extent < 2 {
        return Err("Invalid virtual desktop extent".into());
    }
    Ok(
        ((value.round() - f64::from(origin)) * 65_535.0 / f64::from(extent - 1))
            .round()
            .clamp(0.0, 65_535.0) as i32,
    )
}
fn virtual_key(key: &Key) -> InputResult<(u16, u32)> {
    let code = match key {
        Key::Primary | Key::Control => VK_CONTROL,
        Key::Meta => VK_LWIN,
        Key::Shift => VK_SHIFT,
        Key::Alt => VK_MENU,
        Key::Character(c) if c.is_ascii_alphanumeric() => c.to_ascii_uppercase() as u16,
        Key::Enter => VK_RETURN,
        Key::Tab => VK_TAB,
        Key::Escape => VK_ESCAPE,
        Key::Space => VK_SPACE,
        Key::Backspace => VK_BACK,
        Key::Delete => VK_DELETE,
        Key::Left => VK_LEFT,
        Key::Right => VK_RIGHT,
        Key::Up => VK_UP,
        Key::Down => VK_DOWN,
        Key::Home => VK_HOME,
        Key::End => VK_END,
        Key::PageUp => VK_PRIOR,
        Key::PageDown => VK_NEXT,
        Key::Function(n) if (1..=12).contains(n) => VK_F1 + u16::from(n - 1),
        _ => return Err("Invalid shortcut key".into()),
    };
    let extended = matches!(
        key,
        Key::Meta
            | Key::Delete
            | Key::Left
            | Key::Right
            | Key::Up
            | Key::Down
            | Key::Home
            | Key::End
            | Key::PageUp
            | Key::PageDown
    );
    Ok((code, if extended { KEYEVENTF_EXTENDEDKEY } else { 0 }))
}
struct MonitorCollection {
    displays: Vec<Display>,
    error: Option<String>,
}
unsafe extern "system" fn collect_monitor(
    monitor: HMONITOR,
    _: HDC,
    _: *mut RECT,
    data: LPARAM,
) -> i32 {
    // SAFETY: EnumDisplayMonitors receives this pointer to its synchronous collection.
    let collection = unsafe { &mut *(data as *mut MonitorCollection) };
    match monitor_display(monitor) {
        Ok(display) => {
            collection.displays.push(display);
            1
        }
        Err(error) => {
            collection.error = Some(error);
            0
        }
    }
}
fn monitor_display(monitor: HMONITOR) -> InputResult<Display> {
    let mut info = MONITORINFOEXW {
        monitorInfo: MONITORINFO {
            cbSize: size_of::<MONITORINFOEXW>() as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut scale = 0;
    // SAFETY: Both APIs write into correctly sized local output structures.
    if unsafe { GetMonitorInfoW(monitor, (&raw mut info).cast()) } == 0 {
        return Err("GetMonitorInfoW failed".into());
    }
    if unsafe { GetScaleFactorForMonitor(monitor, &raw mut scale) } < 0 || scale <= 0 {
        return Err("Monitor scale factor unavailable".into());
    }
    let rect = info.monitorInfo.rcMonitor;
    let end = info
        .szDevice
        .iter()
        .position(|&v| v == 0)
        .unwrap_or(info.szDevice.len());
    Ok(Display {
        id: String::from_utf16_lossy(&info.szDevice[..end]),
        bounds: Bounds {
            x: f64::from(rect.left),
            y: f64::from(rect.top),
            width: f64::from(rect.right - rect.left),
            height: f64::from(rect.bottom - rect.top),
        },
        scale_factor: f64::from(scale) / 100.0,
        primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
        coordinate_space: "pixels".into(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn physical_desktop_normalization_and_primary_modifier() {
        assert_eq!(normalize_axis(-1920.0, -1920, 3840), Ok(0));
        assert_eq!(normalize_axis(1919.0, -1920, 3840), Ok(65535));
        assert!(normalize_axis(0.0, 0, 0).is_err());
        assert_eq!(virtual_key(&Key::Primary), Ok((VK_CONTROL, 0)));
    }
    #[test]
    fn unicode_events_preserve_chinese_symbols_and_surrogate_pairs() {
        let text = "你好 =():$ 🐱";
        let units: Vec<u16> = text.encode_utf16().collect();
        let events = unicode_inputs(text);
        assert_eq!(events.len(), units.len() * 2);
        for (unit, pair) in units.iter().zip(events.as_chunks::<2>().0) {
            // SAFETY: unicode_inputs creates only INPUT_KEYBOARD union entries.
            let (down, up) = unsafe { (pair[0].Anonymous.ki, pair[1].Anonymous.ki) };
            assert_eq!(
                (down.wVk, down.wScan, down.dwFlags),
                (0, *unit, KEYEVENTF_UNICODE)
            );
            assert_eq!(
                (up.wScan, up.dwFlags),
                (*unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)
            );
        }
    }
}
