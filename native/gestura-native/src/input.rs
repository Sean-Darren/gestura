use std::collections::HashSet;

pub type InputResult<T> = Result<T, String>;

#[cfg_attr(feature = "addon", napi_derive::napi(object))]
#[derive(Debug, Clone, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
#[cfg_attr(feature = "addon", napi_derive::napi(object))]
#[derive(Debug, Clone, PartialEq)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[cfg_attr(feature = "addon", napi_derive::napi(object))]
#[derive(Debug, Clone, PartialEq)]
pub struct Display {
    pub id: String,
    pub bounds: Bounds,
    pub scale_factor: f64,
    pub primary: bool,
    pub coordinate_space: String,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Hash)]
pub enum Button {
    Left,
    Right,
    Middle,
}
impl Button {
    pub fn parse(value: &str) -> InputResult<Self> {
        match value {
            "left" => Ok(Self::Left),
            "right" => Ok(Self::Right),
            "middle" => Ok(Self::Middle),
            _ => Err(format!("Unknown mouse button: {value}")),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum Key {
    Primary,
    Control,
    Shift,
    Alt,
    Meta,
    Character(char),
    Enter,
    Tab,
    Escape,
    Space,
    Backspace,
    Delete,
    Left,
    Right,
    Up,
    Down,
    Home,
    End,
    PageUp,
    PageDown,
    Function(u8),
}
impl Key {
    pub fn is_modifier(&self) -> bool {
        matches!(
            self,
            Self::Primary | Self::Control | Self::Shift | Self::Alt | Self::Meta
        )
    }
    pub fn parse(value: &str) -> InputResult<Self> {
        let key = match value {
            "primary" => Self::Primary,
            "control" => Self::Control,
            "shift" => Self::Shift,
            "alt" => Self::Alt,
            "meta" => Self::Meta,
            "enter" => Self::Enter,
            "tab" => Self::Tab,
            "escape" => Self::Escape,
            "space" => Self::Space,
            "backspace" => Self::Backspace,
            "delete" => Self::Delete,
            "arrowleft" => Self::Left,
            "arrowright" => Self::Right,
            "arrowup" => Self::Up,
            "arrowdown" => Self::Down,
            "home" => Self::Home,
            "end" => Self::End,
            "pageup" => Self::PageUp,
            "pagedown" => Self::PageDown,
            _ => {
                if value.len() == 1 {
                    let c = value.chars().next().ok_or("Empty key")?;
                    if c.is_ascii_lowercase() || c.is_ascii_digit() {
                        return Ok(Self::Character(c));
                    }
                }
                if let Some(number) = value.strip_prefix('f').and_then(|s| s.parse::<u8>().ok())
                    && (1..=12).contains(&number)
                {
                    return Ok(Self::Function(number));
                }
                return Err(format!("Unknown key: {value}"));
            }
        };
        Ok(key)
    }
}

pub fn parse_combo(values: &[String]) -> InputResult<Vec<Key>> {
    if values.is_empty() || values.len() > 5 {
        return Err("A key combo requires 1 to 5 keys".into());
    }
    let unique: HashSet<&String> = values.iter().collect();
    if unique.len() != values.len() {
        return Err("Duplicate shortcut keys".into());
    }
    let mut keys = values
        .iter()
        .map(|v| Key::parse(v))
        .collect::<InputResult<Vec<_>>>()?;
    if keys.iter().filter(|k| !k.is_modifier()).count() != 1 {
        return Err("A key combo requires exactly one non-modifier key".into());
    }
    if keys.contains(&Key::Primary) && (keys.contains(&Key::Control) || keys.contains(&Key::Meta)) {
        return Err("primary cannot be combined with control or meta".into());
    }
    keys.sort_by_key(|k| !k.is_modifier());
    Ok(keys)
}
pub fn validate_coordinate(value: f64) -> InputResult<()> {
    if !value.is_finite() || value < f64::from(i32::MIN) || value > f64::from(i32::MAX) {
        return Err("Coordinates must be finite signed 32-bit values".into());
    }
    Ok(())
}
pub fn validate_text(text: &str) -> InputResult<()> {
    if text.contains('\0') || text.encode_utf16().count() > 10_000 {
        return Err("Text must have at most 10,000 UTF-16 units and contain no NUL".into());
    }
    Ok(())
}
pub fn validate_scroll(dx: i32, dy: i32) -> InputResult<()> {
    if dx.unsigned_abs() > 10_000 || dy.unsigned_abs() > 10_000 {
        return Err("Scroll deltas must be at most 10,000 wheel units".into());
    }
    Ok(())
}

pub trait InputBackend {
    fn move_to(&mut self, x: f64, y: f64) -> InputResult<()>;
    fn mouse_down(&mut self, button: Button) -> InputResult<()>;
    fn mouse_up(&mut self, button: Button) -> InputResult<()>;
    fn click(&mut self, button: Button) -> InputResult<()> {
        self.mouse_down(button)?;
        self.mouse_up(button)
    }
    fn double_click(&mut self) -> InputResult<()>;
    fn scroll(&mut self, dx: i32, dy: i32) -> InputResult<()>;
    fn type_text(&mut self, text: &str) -> InputResult<()>;
    fn key_combo(&mut self, keys: &[Key]) -> InputResult<()>;
    fn cursor_pos(&self) -> InputResult<Point>;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_native_arguments() {
        assert!(validate_coordinate(f64::NAN).is_err());
        assert!(validate_coordinate(f64::INFINITY).is_err());
        assert!(validate_coordinate(-200.5).is_ok());
        assert!(Button::parse("unknown").is_err());
        assert!(validate_text("Hello 你好 =SUM(A1:A3) : $ 🐱").is_ok());
        assert!(validate_text("\0").is_err());
        assert!(validate_text(&"x".repeat(10_001)).is_err());
        assert!(validate_scroll(i32::MIN, 0).is_err());
    }
    #[test]
    fn validates_and_orders_shortcuts() {
        assert_eq!(
            parse_combo(&["s".into(), "primary".into(), "shift".into()]),
            Ok(vec![Key::Primary, Key::Shift, Key::Character('s')])
        );
        assert!(parse_combo(&["primary".into()]).is_err());
        assert!(parse_combo(&["primary".into(), "primary".into(), "s".into()]).is_err());
        assert!(parse_combo(&["primary".into(), "control".into(), "s".into()]).is_err());
        assert!(parse_combo(&["s".into(), "v".into()]).is_err());
    }
}
