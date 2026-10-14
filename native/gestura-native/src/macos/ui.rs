use crate::input::{Bounds, InputResult};
use crate::ui::{
    ForegroundApp, LIMIT, UiBackend, UiElement, VISIT_LIMIT, intersects, truncate_label,
};
use core_foundation::{
    base::{CFRelease, CFTypeRef, TCFType},
    string::CFString,
    url::CFURL,
};
use std::{
    ffi::c_void,
    path::Path,
    time::{Duration, Instant},
};

type AxRef = *const c_void;
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementCreateSystemWide() -> AxRef;
    fn AXUIElementCopyElementAtPosition(element: AxRef, x: f32, y: f32, result: *mut AxRef) -> i32;
    fn AXUIElementCopyAttributeValue(
        element: AxRef,
        attribute: CFTypeRef,
        result: *mut CFTypeRef,
    ) -> i32;
    fn AXUIElementSetMessagingTimeout(element: AxRef, timeout: f32) -> i32;
    fn AXUIElementGetPid(element: AxRef, pid: *mut i32) -> i32;
    fn AXValueGetValue(value: CFTypeRef, kind: u32, output: *mut c_void) -> bool;
    fn AXValueGetTypeID() -> usize;
}
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFGetTypeID(value: CFTypeRef) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFBooleanGetTypeID() -> usize;
    fn CFBooleanGetValue(value: CFTypeRef) -> bool;
    fn CFArrayGetTypeID() -> usize;
    fn CFArrayGetCount(value: CFTypeRef) -> isize;
    fn CFArrayGetValueAtIndex(value: CFTypeRef, index: isize) -> CFTypeRef;
    fn CFRetain(value: CFTypeRef) -> CFTypeRef;
    fn CFBundleCreate(allocator: CFTypeRef, url: CFTypeRef) -> CFTypeRef;
    fn CFBundleGetIdentifier(bundle: CFTypeRef) -> CFTypeRef;
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
    fn attr(&self, key: &str) -> Option<Self> {
        let key = CFString::new(key);
        let mut result = std::ptr::null();
        let status =
            unsafe { AXUIElementCopyAttributeValue(self.0, key.as_CFTypeRef(), &mut result) };
        if status == 0 && !result.is_null() {
            Some(Self(result))
        } else {
            None
        }
    }
    fn string(&self) -> Option<String> {
        if unsafe { CFGetTypeID(self.0) != CFStringGetTypeID() } {
            return None;
        }
        Some(truncate_label(
            &unsafe { CFString::wrap_under_get_rule(self.0.cast()) }.to_string(),
        ))
    }
    fn text(&self, key: &str) -> Option<String> {
        self.attr(key)?.string()
    }
    fn boolean(&self, key: &str) -> Option<bool> {
        let value = self.attr(key)?;
        if unsafe { CFGetTypeID(value.0) != CFBooleanGetTypeID() } {
            return None;
        }
        Some(unsafe { CFBooleanGetValue(value.0) })
    }
    fn pair(&self, key: &str, kind: u32) -> Option<[f64; 2]> {
        let value = self.attr(key)?;
        if unsafe { CFGetTypeID(value.0) != AXValueGetTypeID() } {
            return None;
        }
        let mut result = [0.0; 2];
        unsafe { AXValueGetValue(value.0, kind, result.as_mut_ptr().cast()) }.then_some(result)
    }
    fn children(&self, remaining: usize) -> Vec<Self> {
        let Some(value) = self.attr("AXChildren") else {
            return Vec::new();
        };
        if unsafe { CFGetTypeID(value.0) != CFArrayGetTypeID() } {
            return Vec::new();
        }
        let count = unsafe { CFArrayGetCount(value.0) }.max(0) as usize;
        (0..count.min(remaining))
            .filter_map(|i| {
                let pointer = unsafe { CFArrayGetValueAtIndex(value.0, i as isize) };
                (!pointer.is_null()).then(|| Self(unsafe { CFRetain(pointer) }))
            })
            .collect()
    }
}
pub struct PlatformUi {
    system: Owned,
}
impl PlatformUi {
    pub fn new() -> InputResult<Self> {
        let pointer = unsafe { AXUIElementCreateSystemWide() };
        if pointer.is_null() {
            return Err("Cannot create AX system element".into());
        }
        unsafe {
            AXUIElementSetMessagingTimeout(pointer, 0.01);
        }
        Ok(Self {
            system: Owned(pointer),
        })
    }
    fn element(&self, ax: &Owned, displays: &[crate::input::Display]) -> Option<UiElement> {
        let ax_role = ax.text("AXRole")?;
        let role = if ax.text("AXSubrole").as_deref() == Some("AXTabButton")
            || (ax_role == "AXRadioButton"
                && ax
                    .attr("AXParent")
                    .and_then(|p| p.text("AXRole"))
                    .as_deref()
                    == Some("AXTabGroup"))
        {
            "tab"
        } else {
            role(&ax_role)?
        };
        let [x, y] = ax.pair("AXPosition", 1)?;
        let [width, height] = ax.pair("AXSize", 2)?;
        let bounds = Bounds {
            x,
            y,
            width,
            height,
        };
        if !intersects(&bounds, x, y, 0.0) {
            return None;
        }
        let onscreen = displays
            .iter()
            .any(|d| rectangles_overlap(&bounds, &d.bounds));
        Some(UiElement {
            bounds,
            role: role.into(),
            name: ax
                .text("AXTitle")
                .filter(|s| !s.is_empty())
                .or_else(|| ax.text("AXDescription"))
                .unwrap_or_default(),
            is_enabled: ax.boolean("AXEnabled").unwrap_or(false),
            is_offscreen: !onscreen
                || ax.boolean("AXHidden").unwrap_or(false)
                || ax
                    .attr("AXWindow")
                    .and_then(|w| w.boolean("AXMinimized"))
                    .unwrap_or(false),
            is_clickable: true,
        })
    }
}
fn rectangles_overlap(a: &Bounds, b: &Bounds) -> bool {
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
fn role(value: &str) -> Option<&'static str> {
    match value {
        "AXButton" | "AXPopUpButton" | "AXMenuButton" => Some("button"),
        "AXLink" => Some("link"),
        "AXMenuItem" | "AXMenuBarItem" => Some("menu-item"),
        "AXRow" => Some("list-item"),
        "AXCheckBox" => Some("check-box"),
        "AXTextField" | "AXTextArea" | "AXComboBox" => Some("edit-field"),
        "AXCell" => Some("spreadsheet-cell"),
        _ => None,
    }
}
impl UiBackend for PlatformUi {
    fn near(&mut self, x: f64, y: f64, radius_px: f64, at: bool) -> InputResult<Vec<UiElement>> {
        if !super::PlatformInput::has_permission() {
            return Err("Accessibility permission is required".into());
        }
        let start = Instant::now();
        let displays = super::PlatformInput::displays()?;
        let scale = displays
            .iter()
            .find(|d| intersects(&d.bounds, x, y, 0.0))
            .map(|d| d.scale_factor)
            .unwrap_or(1.0);
        let radius = radius_px / scale;
        let mut hit = std::ptr::null();
        let status = unsafe {
            AXUIElementCopyElementAtPosition(self.system.0, x as f32, y as f32, &mut hit)
        };
        if status == -25212 {
            return Ok(Vec::new());
        }
        if status != 0 || hit.is_null() {
            return Err(format!("AX hit-test failed ({status})"));
        }
        let mut hit = Owned(hit);
        let mut results = Vec::new();
        // The hit is often a label; climb to its actionable control first.
        for _ in 0..8 {
            if let Some(element) = self.element(&hit, &displays) {
                if intersects(&element.bounds, x, y, radius) {
                    results.push(element);
                }
                break;
            }
            if start.elapsed() >= Duration::from_millis(15) {
                break;
            }
            let Some(parent) = hit.attr("AXParent") else {
                break;
            };
            hit = parent;
        }
        if at {
            results.truncate(1);
            return Ok(results);
        }
        let Some(parent) = hit.attr("AXParent") else {
            return Ok(results);
        };
        let mut pending = parent.children(VISIT_LIMIT);
        let mut visited = 0;
        while let Some(candidate) = pending.pop() {
            if visited >= VISIT_LIMIT
                || results.len() >= LIMIT
                || start.elapsed() >= Duration::from_millis(15)
            {
                break;
            }
            visited += 1;
            if let Some(element) = self.element(&candidate, &displays)
                && intersects(&element.bounds, x, y, radius)
                && !results.contains(&element)
            {
                results.push(element);
            }
            pending.extend(candidate.children(VISIT_LIMIT.saturating_sub(visited + pending.len())));
        }
        Ok(results)
    }
    fn foreground(&mut self) -> InputResult<ForegroundApp> {
        if !super::PlatformInput::has_permission() {
            return Err("Accessibility permission is required".into());
        }
        let app = self
            .system
            .attr("AXFocusedApplication")
            .ok_or("No focused application")?;
        let mut pid = 0;
        if unsafe { AXUIElementGetPid(app.0, &mut pid) } != 0 {
            return Err("Cannot get foreground PID".into());
        }
        let mut buffer = [0u8; 4096];
        let length = unsafe { proc_pidpath(pid, buffer.as_mut_ptr().cast(), buffer.len() as u32) };
        if length <= 0 {
            return Err("Cannot get foreground executable path".into());
        }
        let end = buffer.iter().position(|b| *b == 0).unwrap_or(buffer.len());
        let path = String::from_utf8_lossy(&buffer[..end]);
        let bundle_path = Path::new(path.as_ref())
            .ancestors()
            .find(|p| p.extension().is_some_and(|e| e == "app"))
            .ok_or("Foreground process has no app bundle")?;
        let url = CFURL::from_path(bundle_path, true).ok_or("Cannot make bundle URL")?;
        let bundle = unsafe { CFBundleCreate(std::ptr::null(), url.as_CFTypeRef()) };
        if bundle.is_null() {
            return Err("Cannot open foreground bundle".into());
        }
        let bundle = Owned(bundle);
        let identifier = unsafe { CFBundleGetIdentifier(bundle.0) };
        if identifier.is_null() {
            return Err("Foreground bundle has no identifier".into());
        }
        let app_id = Owned(unsafe { CFRetain(identifier) })
            .string()
            .ok_or("Invalid bundle identifier")?;
        let window_title = app
            .attr("AXFocusedWindow")
            .and_then(|w| w.text("AXTitle"))
            .unwrap_or_default();
        Ok(ForegroundApp {
            app_id,
            window_title,
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_roles() {
        assert_eq!(role("AXCell"), Some("spreadsheet-cell"));
        assert_eq!(role("AXTextField"), Some("edit-field"));
        assert_eq!(role("AXStaticText"), None);
    }
}
