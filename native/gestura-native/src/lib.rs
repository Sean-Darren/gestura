#![deny(clippy::unwrap_used, clippy::expect_used)]

pub mod input;
#[cfg(target_os = "macos")]
mod macos;
pub mod ui;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "macos")]
pub use macos::PlatformInput;
#[cfg(target_os = "windows")]
pub use windows::PlatformInput;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
compile_error!("Gestura native input supports macOS and Windows only");

#[cfg(feature = "addon")]
pub mod addon {
    use super::{PlatformInput, input::*};
    use napi_derive::napi;
    use std::cell::RefCell;

    thread_local! {
        static INPUT: RefCell<Option<PlatformInput>> = const { RefCell::new(None) };
    }
    #[napi]
    pub fn protect_pairing_directory(path: String) -> napi::Result<()> {
        #[cfg(target_os = "macos")]
        let result = super::macos::pairing::protect_directory(&path);
        #[cfg(target_os = "windows")]
        let result = super::windows::pairing::protect_directory(&path);
        result.map_err(api_error)
    }
    fn api_error(message: String) -> napi::Error {
        napi::Error::from_reason(message)
    }
    fn with_input<T>(
        operation: impl FnOnce(&mut PlatformInput) -> InputResult<T>,
    ) -> napi::Result<T> {
        INPUT.with(|slot| {
            let mut slot = slot
                .try_borrow_mut()
                .map_err(|e| api_error(e.to_string()))?;
            if slot.is_none() {
                *slot = Some(PlatformInput::new().map_err(api_error)?);
            }
            let backend = slot
                .as_mut()
                .ok_or_else(|| api_error("Input backend unavailable".into()))?;
            operation(backend).map_err(api_error)
        })
    }
    #[napi]
    pub fn move_to(x: f64, y: f64) -> napi::Result<()> {
        validate_coordinate(x).map_err(api_error)?;
        validate_coordinate(y).map_err(api_error)?;
        with_input(|input| input.move_to(x, y))
    }
    #[napi]
    pub fn click(button: String) -> napi::Result<()> {
        let button = Button::parse(&button).map_err(api_error)?;
        with_input(|input| input.click(button))
    }
    #[napi]
    pub fn double_click() -> napi::Result<()> {
        with_input(|input| input.double_click())
    }
    #[napi]
    pub fn mouse_down(button: String) -> napi::Result<()> {
        let button = Button::parse(&button).map_err(api_error)?;
        with_input(|input| input.mouse_down(button))
    }
    #[napi]
    pub fn mouse_up(button: String) -> napi::Result<()> {
        let button = Button::parse(&button).map_err(api_error)?;
        with_input(|input| input.mouse_up(button))
    }
    #[napi]
    pub fn scroll(dx: i32, dy: i32) -> napi::Result<()> {
        validate_scroll(dx, dy).map_err(api_error)?;
        with_input(|input| input.scroll(dx, dy))
    }
    #[napi]
    pub fn type_text(text: String) -> napi::Result<()> {
        validate_text(&text).map_err(api_error)?;
        with_input(|input| input.type_text(&text))
    }
    #[napi]
    pub fn key_combo(keys: Vec<String>) -> napi::Result<()> {
        let keys = parse_combo(&keys).map_err(api_error)?;
        with_input(|input| input.key_combo(&keys))
    }
    #[napi]
    pub fn get_cursor_pos() -> napi::Result<Point> {
        with_input(|input| input.cursor_pos())
    }
    #[napi]
    pub fn get_displays() -> napi::Result<Vec<Display>> {
        PlatformInput::displays().map_err(api_error)
    }
    #[napi]
    pub fn has_input_permission() -> bool {
        PlatformInput::has_permission()
    }
    #[napi]
    pub fn request_input_permission() -> bool {
        PlatformInput::request_permission()
    }
}
