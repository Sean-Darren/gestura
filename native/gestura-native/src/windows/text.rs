use crate::{input::InputResult, ui::FocusedText};
use std::time::{Duration, Instant};
use windows::Win32::UI::{
    Accessibility::*,
    WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};
use windows::{
    Win32::{
        Foundation::CloseHandle,
        System::Threading::{
            OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
            QueryFullProcessImageNameW,
        },
    },
    core::PWSTR,
};
struct Snapshot {
    token: String,
    field: IUIAutomationElement,
    selection: IUIAutomationTextRange,
    start_units: i32,
    selected: String,
    created: Instant,
}
pub struct Backend {
    automation: IUIAutomation,
    snapshot: Option<Snapshot>,
}
impl Backend {
    pub fn new(automation: IUIAutomation) -> Self {
        Self {
            automation,
            snapshot: None,
        }
    }
    unsafe fn focused(
        &self,
    ) -> windows::core::Result<(
        IUIAutomationElement,
        IUIAutomationTextPattern,
        IUIAutomationTextRange,
    )> {
        unsafe {
            let field = self.automation.GetFocusedElement()?;
            let mut pid = 0;
            GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut pid));
            if !matches!(field.CurrentControlType()?.0, 50004 | 50030)
                || pid == std::process::id()
                || field.CurrentProcessId()? as u32 != pid
                || !field.CurrentHasKeyboardFocus()?.as_bool()
                || !field.CurrentIsEnabled()?.as_bool()
                || field.CurrentIsPassword()?.as_bool()
                || field.CurrentIsOffscreen()?.as_bool()
            {
                return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                    0x80004005u32 as i32,
                )));
            }
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)?;
            let mut path = [0u16; 4096];
            let mut length = path.len() as u32;
            let result = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(path.as_mut_ptr()),
                &mut length,
            );
            let _ = CloseHandle(process);
            result?;
            if crate::ui::unsafe_text_host(&String::from_utf16_lossy(&path[..length as usize])) {
                return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                    0x80004005u32 as i32,
                )));
            }
            let value: IUIAutomationValuePattern = field.GetCurrentPatternAs(UIA_ValuePatternId)?;
            if value.CurrentIsReadOnly()?.as_bool() {
                return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                    0x80004005u32 as i32,
                )));
            }
            let pattern: IUIAutomationTextPattern = field.GetCurrentPatternAs(UIA_TextPatternId)?;
            let selection = pattern.GetSelection()?;
            if selection.Length()? != 1 {
                return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                    0x80004005u32 as i32,
                )));
            }
            Ok((field, pattern, selection.GetElement(0)?))
        }
    }
    pub fn capture(&mut self, token: &str) -> InputResult<Option<FocusedText>> {
        self.snapshot = None;
        // SAFETY: All COM objects belong to the dedicated initialized UIA thread.
        unsafe {
            let Ok((field, pattern, selection)) = self.focused() else {
                return Ok(None);
            };
            let selected = selection
                .GetText(10001)
                .map_err(|e| e.to_string())?
                .to_string();
            if selected.encode_utf16().count() > 10000 || selected.contains('\0') {
                return Ok(None);
            }
            let anchor = selection.Clone().map_err(|e| e.to_string())?;
            anchor
                .MoveEndpointByRange(
                    TextPatternRangeEndpoint_End,
                    &anchor,
                    TextPatternRangeEndpoint_Start,
                )
                .map_err(|e| e.to_string())?;
            let moved = anchor
                .Move(TextUnit_Character, -1_000_001)
                .map_err(|e| e.to_string())?;
            if !(-1_000_000..=0).contains(&moved) {
                return Ok(None);
            }
            let start = pattern.DocumentRange().map_err(|e| e.to_string())?;
            start
                .MoveEndpointByRange(
                    TextPatternRangeEndpoint_End,
                    &start,
                    TextPatternRangeEndpoint_Start,
                )
                .map_err(|e| e.to_string())?;
            if start
                .Move(TextUnit_Character, -moved)
                .map_err(|e| e.to_string())?
                != -moved
                || start
                    .CompareEndpoints(
                        TextPatternRangeEndpoint_Start,
                        &selection,
                        TextPatternRangeEndpoint_Start,
                    )
                    .map_err(|e| e.to_string())?
                    != 0
            {
                return Ok(None);
            }
            self.snapshot = Some(Snapshot {
                token: token.into(),
                field,
                selection,
                start_units: -moved,
                selected: selected.clone(),
                created: Instant::now(),
            });
            Ok(Some(FocusedText {
                token: token.into(),
                selected_text: selected,
            }))
        }
    }
    pub fn check(
        &mut self,
        token: &str,
        text: &str,
        after: bool,
        select: bool,
    ) -> InputResult<bool> {
        unsafe {
            let Ok((field, pattern, current)) = self.focused() else {
                return Ok(false);
            };
            let Some(snapshot) = &mut self.snapshot else {
                return Ok(false);
            };
            if snapshot.token != token
                || snapshot.created.elapsed() >= Duration::from_secs(60)
                || !self
                    .automation
                    .CompareElements(&field, &snapshot.field)
                    .map_err(|e| e.to_string())?
                    .as_bool()
            {
                return Ok(false);
            }
            if !after {
                let position = current.Clone().map_err(|e| e.to_string())?;
                position
                    .MoveEndpointByRange(
                        TextPatternRangeEndpoint_End,
                        &position,
                        TextPatternRangeEndpoint_Start,
                    )
                    .map_err(|e| e.to_string())?;
                let units = -position
                    .Move(TextUnit_Character, -1_000_001)
                    .map_err(|e| e.to_string())?;
                if units != snapshot.start_units {
                    return Ok(false);
                }
                let matches = current
                    .Compare(&snapshot.selection)
                    .map_err(|e| e.to_string())?
                    .as_bool();
                return Ok(matches
                    && current.GetText(10001).map_err(|e| e.to_string())? == snapshot.selected);
            }
            if current
                .CompareEndpoints(
                    TextPatternRangeEndpoint_Start,
                    &current,
                    TextPatternRangeEndpoint_End,
                )
                .map_err(|e| e.to_string())?
                != 0
            {
                return Ok(false);
            }
            let range = pattern.DocumentRange().map_err(|e| e.to_string())?;
            range
                .MoveEndpointByRange(
                    TextPatternRangeEndpoint_End,
                    &range,
                    TextPatternRangeEndpoint_Start,
                )
                .map_err(|e| e.to_string())?;
            if range
                .Move(TextUnit_Character, snapshot.start_units)
                .map_err(|e| e.to_string())?
                != snapshot.start_units
            {
                return Ok(false);
            }
            range
                .MoveEndpointByRange(
                    TextPatternRangeEndpoint_End,
                    &current,
                    TextPatternRangeEndpoint_Start,
                )
                .map_err(|e| e.to_string())?;
            let actual = range.GetText(10001).map_err(|e| e.to_string())?.to_string();
            if actual.encode_utf16().count() > 10000
                || actual.replace("\r\n", "\n") != text.replace("\r\n", "\n")
            {
                return Ok(false);
            }
            if select {
                range.Select().map_err(|e| e.to_string())?;
                snapshot.selection = range;
                snapshot.selected = actual;
            }
            Ok(true)
        }
    }
}
