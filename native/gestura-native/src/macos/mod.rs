use crate::input::*;
use core_foundation::{
    base::TCFType,
    boolean::CFBoolean,
    dictionary::{CFDictionary, CFDictionaryRef},
    string::{CFString, CFStringRef},
};
use core_graphics::{
    display::CGDisplay,
    event::{
        CGEvent, CGEventFlags, CGEventTapLocation, CGEventType, CGMouseButton, EventField,
        ScrollEventUnit,
    },
    event_source::{CGEventSource, CGEventSourceStateID},
    geometry::CGPoint,
};
use std::collections::HashSet;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

pub struct PlatformInput {
    source: CGEventSource,
    held: HashSet<Button>,
}
impl PlatformInput {
    pub fn new() -> InputResult<Self> {
        let source = CGEventSource::new(CGEventSourceStateID::Private)
            .map_err(|()| "Could not create CGEvent source")?;
        Ok(Self {
            source,
            held: HashSet::new(),
        })
    }
    pub fn has_permission() -> bool {
        // SAFETY: Accessibility exports this process-wide, argument-free query.
        unsafe { AXIsProcessTrusted() }
    }
    pub fn request_permission() -> bool {
        // SAFETY: The global CFString is borrowed; the dictionary retains its entries.
        let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
        let options = CFDictionary::from_CFType_pairs(&[(key, CFBoolean::true_value())]);
        unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) }
    }
    pub fn displays() -> InputResult<Vec<Display>> {
        let primary = CGDisplay::main().id;
        CGDisplay::active_displays()
            .map_err(|code| format!("Display enumeration failed: {code}"))?
            .into_iter()
            .map(|id| {
                let display = CGDisplay::new(id);
                let rect = display.bounds();
                let mode = display.display_mode().ok_or("Display mode unavailable")?;
                if rect.size.width <= 0.0 {
                    return Err("Invalid display width".into());
                }
                Ok(Display {
                    id: id.to_string(),
                    bounds: Bounds {
                        x: rect.origin.x,
                        y: rect.origin.y,
                        width: rect.size.width,
                        height: rect.size.height,
                    },
                    scale_factor: mode.pixel_width() as f64 / rect.size.width,
                    primary: id == primary,
                    coordinate_space: "points".into(),
                })
            })
            .collect()
    }
    fn require_permission(&self) -> InputResult<()> {
        if Self::has_permission() {
            Ok(())
        } else {
            Err("Accessibility input permission is required".into())
        }
    }
    fn button_event(&self, button: Button, down: bool, click_count: i64) -> InputResult<()> {
        self.require_permission()?;
        let point = self.cursor_pos()?;
        let (native_button, event_type) = match (button, down) {
            (Button::Left, true) => (CGMouseButton::Left, CGEventType::LeftMouseDown),
            (Button::Left, false) => (CGMouseButton::Left, CGEventType::LeftMouseUp),
            (Button::Right, true) => (CGMouseButton::Right, CGEventType::RightMouseDown),
            (Button::Right, false) => (CGMouseButton::Right, CGEventType::RightMouseUp),
            (Button::Middle, true) => (CGMouseButton::Center, CGEventType::OtherMouseDown),
            (Button::Middle, false) => (CGMouseButton::Center, CGEventType::OtherMouseUp),
        };
        let event = CGEvent::new_mouse_event(
            self.source.clone(),
            event_type,
            CGPoint::new(point.x, point.y),
            native_button,
        )
        .map_err(|()| "Could not create mouse event")?;
        event.set_integer_value_field(EventField::MOUSE_EVENT_CLICK_STATE, click_count);
        event.post(CGEventTapLocation::HID);
        Ok(())
    }
    fn key_event(&self, key: &Key, down: bool, flags: CGEventFlags) -> InputResult<()> {
        let event = CGEvent::new_keyboard_event(self.source.clone(), key_code(key)?, down)
            .map_err(|()| "Could not create keyboard event")?;
        event.set_flags(flags);
        event.post(CGEventTapLocation::HID);
        Ok(())
    }
}
impl InputBackend for PlatformInput {
    fn move_to(&mut self, x: f64, y: f64) -> InputResult<()> {
        self.require_permission()?;
        let (kind, button) = if self.held.contains(&Button::Left) {
            (CGEventType::LeftMouseDragged, CGMouseButton::Left)
        } else if self.held.contains(&Button::Right) {
            (CGEventType::RightMouseDragged, CGMouseButton::Right)
        } else if self.held.contains(&Button::Middle) {
            (CGEventType::OtherMouseDragged, CGMouseButton::Center)
        } else {
            (CGEventType::MouseMoved, CGMouseButton::Left)
        };
        let event = CGEvent::new_mouse_event(self.source.clone(), kind, CGPoint::new(x, y), button)
            .map_err(|()| "Could not create cursor event")?;
        event.post(CGEventTapLocation::HID);
        Ok(())
    }
    fn mouse_down(&mut self, button: Button) -> InputResult<()> {
        self.button_event(button, true, 1)?;
        self.held.insert(button);
        Ok(())
    }
    fn mouse_up(&mut self, button: Button) -> InputResult<()> {
        self.button_event(button, false, 1)?;
        self.held.remove(&button);
        Ok(())
    }
    fn double_click(&mut self) -> InputResult<()> {
        for count in [1, 2] {
            self.button_event(Button::Left, true, count)?;
            self.button_event(Button::Left, false, count)?;
        }
        Ok(())
    }
    fn scroll(&mut self, dx: i32, dy: i32) -> InputResult<()> {
        self.require_permission()?;
        let event =
            CGEvent::new_scroll_event(self.source.clone(), ScrollEventUnit::LINE, 2, -dy, -dx, 0)
                .map_err(|()| "Could not create scroll event")?;
        event.post(CGEventTapLocation::HID);
        Ok(())
    }
    fn type_text(&mut self, text: &str) -> InputResult<()> {
        self.require_permission()?;
        for character in text.chars() {
            for down in [true, false] {
                let event = CGEvent::new_keyboard_event(self.source.clone(), 0, down)
                    .map_err(|()| "Could not create Unicode event")?;
                event.set_flags(CGEventFlags::empty());
                event.set_string(&character.to_string());
                event.post(CGEventTapLocation::HID);
            }
        }
        Ok(())
    }
    fn key_combo(&mut self, keys: &[Key]) -> InputResult<()> {
        self.require_permission()?;
        let mut flags = CGEventFlags::empty();
        let mut held = Vec::new();
        let result = (|| {
            for key in keys {
                flags.insert(modifier_flag(key));
                self.key_event(key, true, flags)?;
                held.push(key);
            }
            Ok(())
        })();
        let mut release_error = None;
        for key in held.into_iter().rev() {
            flags.remove(modifier_flag(key));
            if let Err(error) = self.key_event(key, false, flags) {
                release_error = Some(error);
            }
        }
        result.and(release_error.map_or(Ok(()), Err))
    }
    fn cursor_pos(&self) -> InputResult<Point> {
        let event =
            CGEvent::new(self.source.clone()).map_err(|()| "Could not read cursor position")?;
        let point = event.location();
        Ok(Point {
            x: point.x,
            y: point.y,
        })
    }
}
fn modifier_flag(key: &Key) -> CGEventFlags {
    match key {
        Key::Primary | Key::Meta => CGEventFlags::CGEventFlagCommand,
        Key::Control => CGEventFlags::CGEventFlagControl,
        Key::Shift => CGEventFlags::CGEventFlagShift,
        Key::Alt => CGEventFlags::CGEventFlagAlternate,
        _ => CGEventFlags::empty(),
    }
}
fn key_code(key: &Key) -> InputResult<u16> {
    let code = match key {
        Key::Primary | Key::Meta => 55,
        Key::Control => 59,
        Key::Shift => 56,
        Key::Alt => 58,
        Key::Enter => 36,
        Key::Tab => 48,
        Key::Escape => 53,
        Key::Space => 49,
        Key::Backspace => 51,
        Key::Delete => 117,
        Key::Left => 123,
        Key::Right => 124,
        Key::Up => 126,
        Key::Down => 125,
        Key::Home => 115,
        Key::End => 119,
        Key::PageUp => 116,
        Key::PageDown => 121,
        Key::Function(number) => match number {
            1 => 122,
            2 => 120,
            3 => 99,
            4 => 118,
            5 => 96,
            6 => 97,
            7 => 98,
            8 => 100,
            9 => 101,
            10 => 109,
            11 => 103,
            12 => 111,
            _ => return Err("Invalid function key".into()),
        },
        Key::Character(c) => match c {
            'a' => 0,
            's' => 1,
            'd' => 2,
            'f' => 3,
            'h' => 4,
            'g' => 5,
            'z' => 6,
            'x' => 7,
            'c' => 8,
            'v' => 9,
            'b' => 11,
            'q' => 12,
            'w' => 13,
            'e' => 14,
            'r' => 15,
            'y' => 16,
            't' => 17,
            '1' => 18,
            '2' => 19,
            '3' => 20,
            '4' => 21,
            '6' => 22,
            '5' => 23,
            '9' => 25,
            '7' => 26,
            '8' => 28,
            '0' => 29,
            'o' => 31,
            'u' => 32,
            'i' => 34,
            'p' => 35,
            'l' => 37,
            'j' => 38,
            'k' => 40,
            'n' => 45,
            'm' => 46,
            _ => return Err("Invalid shortcut character".into()),
        },
    };
    Ok(code)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn primary_is_command() {
        assert_eq!(key_code(&Key::Primary), Ok(55));
        assert_eq!(
            modifier_flag(&Key::Primary),
            CGEventFlags::CGEventFlagCommand
        );
    }
}
