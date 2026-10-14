use crate::input::{Bounds, InputResult};
use crate::ui::{
    ForegroundApp, LIMIT, UiBackend, UiElement, VISIT_LIMIT, intersects, truncate_label,
};
use std::time::{Duration, Instant};
use windows::{
    Win32::{
        Foundation::CloseHandle,
        System::{
            Com::{
                CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
                CoUninitialize,
            },
            Threading::{
                OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
                QueryFullProcessImageNameW,
            },
        },
        UI::{
            Accessibility::*,
            WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId},
        },
    },
    core::PWSTR,
};
struct Com;
impl Drop for Com {
    fn drop(&mut self) {
        unsafe { CoUninitialize() }
    }
}
pub struct PlatformUi {
    automation: IUIAutomation,
    cache: IUIAutomationCacheRequest,
    walker: IUIAutomationTreeWalker,
    _com: Com,
}
impl PlatformUi {
    pub fn new() -> InputResult<Self> {
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
            .ok()
            .map_err(|e| e.to_string())?;
        let com = Com;
        let initialize = || -> windows::core::Result<_> {
            unsafe {
                let automation: IUIAutomation =
                    CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
                let cache = automation.CreateCacheRequest()?;
                cache.SetTreeScope(TreeScope_Element)?;
                cache.SetAutomationElementMode(AutomationElementMode_Full)?;
                for property in [
                    UIA_BoundingRectanglePropertyId,
                    UIA_ControlTypePropertyId,
                    UIA_NamePropertyId,
                    UIA_IsEnabledPropertyId,
                    UIA_IsOffscreenPropertyId,
                ] {
                    cache.AddProperty(property)?;
                }
                cache.AddPattern(UIA_GridItemPatternId)?;
                let walker = automation.ControlViewWalker()?;
                Ok((automation, cache, walker))
            }
        };
        let (automation, cache, walker) = initialize().map_err(|e| e.to_string())?;
        Ok(Self {
            automation,
            cache,
            walker,
            _com: com,
        })
    }
    fn element(&self, element: &IUIAutomationElement) -> Option<UiElement> {
        unsafe {
            let control = element.CachedControlType().ok()?.0;
            let role = role(control)?;
            if role == "spreadsheet-cell"
                && element
                    .GetCachedPatternAs::<IUIAutomationGridItemPattern>(UIA_GridItemPatternId)
                    .is_err()
            {
                return None;
            }
            let r = element.CachedBoundingRectangle().ok()?;
            let bounds = Bounds {
                x: f64::from(r.left),
                y: f64::from(r.top),
                width: f64::from(r.right) - f64::from(r.left),
                height: f64::from(r.bottom) - f64::from(r.top),
            };
            if !intersects(&bounds, bounds.x, bounds.y, 0.0) {
                return None;
            }
            Some(UiElement {
                bounds,
                role: role.into(),
                name: truncate_label(&element.CachedName().ok()?.to_string()),
                is_enabled: element.CachedIsEnabled().ok()?.as_bool(),
                is_offscreen: element.CachedIsOffscreen().ok()?.as_bool(),
                is_clickable: true,
            })
        }
    }
}
fn role(control: i32) -> Option<&'static str> {
    match control {
        50000 => Some("button"),
        50005 => Some("link"),
        50011 => Some("menu-item"),
        50019 => Some("tab"),
        50007 => Some("list-item"),
        50002 => Some("check-box"),
        50004 | 50003 => Some("edit-field"),
        50029 => Some("spreadsheet-cell"),
        _ => None,
    }
}
impl UiBackend for PlatformUi {
    fn near(&mut self, x: f64, y: f64, radius_px: f64, at: bool) -> InputResult<Vec<UiElement>> {
        let _dpi = super::DpiScope::enter()?;
        let start = Instant::now();
        let mut hit = unsafe {
            self.automation.ElementFromPointBuildCache(
                windows::Win32::Foundation::POINT {
                    x: x.round() as i32,
                    y: y.round() as i32,
                },
                &self.cache,
            )
        }
        .map_err(|e| e.to_string())?;
        let mut results = Vec::new();
        for _ in 0..8 {
            if let Some(element) = self.element(&hit) {
                if intersects(&element.bounds, x, y, radius_px) {
                    results.push(element);
                }
                break;
            }
            if start.elapsed() >= Duration::from_millis(15) {
                break;
            }
            let Ok(parent) = (unsafe { self.walker.GetParentElementBuildCache(&hit, &self.cache) })
            else {
                break;
            };
            hit = parent;
        }
        if at {
            results.truncate(1);
            return Ok(results);
        }
        let Ok(parent) = (unsafe { self.walker.GetParentElementBuildCache(&hit, &self.cache) })
        else {
            return Ok(results);
        };
        let mut pending = Vec::new();
        if let Ok(child) = unsafe {
            self.walker
                .GetFirstChildElementBuildCache(&parent, &self.cache)
        } {
            pending.push(child);
        }
        let mut visited = 0;
        while let Some(candidate) = pending.pop() {
            if visited >= VISIT_LIMIT
                || results.len() >= LIMIT
                || start.elapsed() >= Duration::from_millis(15)
            {
                break;
            }
            visited += 1;
            if let Ok(sibling) = unsafe {
                self.walker
                    .GetNextSiblingElementBuildCache(&candidate, &self.cache)
            } {
                pending.push(sibling);
            }
            if let Some(element) = self.element(&candidate)
                && intersects(&element.bounds, x, y, radius_px)
                && !results.contains(&element)
            {
                results.push(element);
            }
            if let Ok(child) = unsafe {
                self.walker
                    .GetFirstChildElementBuildCache(&candidate, &self.cache)
            } {
                pending.push(child);
            }
        }
        Ok(results)
    }
    fn foreground(&mut self) -> InputResult<ForegroundApp> {
        unsafe {
            let window = GetForegroundWindow();
            if window.is_invalid() {
                return Err("No foreground window".into());
            }
            let mut pid = 0;
            GetWindowThreadProcessId(window, Some(&mut pid));
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
                .map_err(|e| e.to_string())?;
            let mut path = [0u16; 4096];
            let mut length = path.len() as u32;
            let result = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(path.as_mut_ptr()),
                &mut length,
            );
            let _ = CloseHandle(process);
            result.map_err(|e| e.to_string())?;
            let path = String::from_utf16_lossy(&path[..length as usize]);
            let app_id = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string();
            let mut title = [0u16; 4096];
            let length = GetWindowTextW(window, &mut title).max(0) as usize;
            Ok(ForegroundApp {
                app_id,
                window_title: String::from_utf16_lossy(&title[..length]),
            })
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_roles() {
        assert_eq!(role(UIA_DataItemControlTypeId.0), Some("spreadsheet-cell"));
        assert_eq!(role(UIA_TabItemControlTypeId.0), Some("tab"));
        assert_eq!(role(UIA_TextControlTypeId.0), None);
    }
}
