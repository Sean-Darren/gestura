# 0002: Native input injection

Date: 2026-10-14

Status: accepted for P1.1

## Decision

Use CGEvent on macOS and SendInput on Windows behind the Rust `InputBackend`
trait. napi-rs exposes synchronous Node-API 8 functions. `core-graphics` and
`core-foundation` provide the macOS bindings; `windows-sys` provides Win32
input, monitor, and DPI APIs. These dependencies are restricted to their
respective targets. Platform implementation files stay in `src/macos` and
`src/windows`.

We evaluated enigo 0.6.1. Its Unicode text API is useful, but its Windows
absolute movement normalizes against the primary display and omits
MOUSEEVENTF_VIRTUALDESK. Its macOS cursor lookup combines AppKit mouseLocation
with the main display's pixels_high, while our contract explicitly separates
logical points from backing pixels. Correcting movement, cursor reads,
display enumeration, scale, permissions, and double-click state would require
replacing much of the relevant backend. Direct APIs keep that contract in our
own small implementations. This is a source review, not a measured enigo
runtime failure.

Sources:
- [enigo macOS source, 0.6.1 packaged commit](https://github.com/enigo-rs/enigo/blob/b297a14e807abdf818b7809a70b445ade4fc5897/src/macos/macos_impl.rs)
- [enigo Windows source, 0.6.1 packaged commit](https://github.com/enigo-rs/enigo/blob/b297a14e807abdf818b7809a70b445ade4fc5897/src/win/win_impl.rs)
- [Microsoft MOUSEINPUT coordinate contract](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput)
- [Microsoft SendInput and UIPI](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)
- [Apple CGDisplayBounds](https://developer.apple.com/documentation/coregraphics/cgdisplaybounds(_:))
- [napi-rs support and compatibility](https://napi.rs/docs/more/support-compatibility)

## Coordinates

Coordinates use the global desktop origin at the primary display's top-left;
x grows right and y grows down. Other displays may have negative origins.
`getDisplays()` includes native bounds, `scaleFactor`, `primary`, and
`coordinateSpace` so callers do not infer units from the host OS.

On macOS, CGDisplayBounds, CGEventLocation and moveTo all use Quartz logical
points. The backing scale is display-mode pixel width divided by logical
bound width. A Retina display typically has scaleFactor 2. A display-local
Electron DIP position maps to `bounds.origin + localDIP`; backing pixels are
`localPoints * scaleFactor`. No AppKit bottom-left inversion is involved.

On Windows, bounds and cursor positions are physical pixels under a temporary
per-monitor-v2 thread DPI context, restored before returning. GetScaleFactorForMonitor
provides the scale independently of DIP bounds. A display-local Electron DIP
position maps to `nativeBounds.origin + localDIP * scaleFactor`; do not multiply
an entire global DIP coordinate, since monitor origins can use different
scales. Fractional moveTo values round to the nearest physical pixel.

SendInput requires 0..65535 normalized coordinates. For each axis we use
`round((pixel - virtualOrigin) * 65535 / (virtualExtent - 1))`, clamp to that
range, and set both ABSOLUTE and VIRTUALDESK. Display-local conversion and
the demo's 20-physical-pixel inset have fixture tests.

Scroll deltas are signed wheel units: positive x scrolls right, positive y
scrolls down. Windows uses 120 per unit; macOS posts line-based CGEvent
scrolling. The OS and target application determine the amount scrolled.

## Text, shortcuts, and stopping

Text uses CGEvent Unicode strings on macOS and UTF-16 KEYEVENTF_UNICODE events
on Windows, including surrogate pairs. It does not use the clipboard or a
keyboard layout to produce Chinese or `= ( ) : $`. Shortcut names are lower
case; `primary` maps to Command on macOS and Control on Windows. macOS ASCII
shortcut keys use standard ANSI hardware positions, so alternate shortcut
layouts need manual checks. Unicode text does not have that limitation.

The desktop wrapper validates all arguments with Zod, checks returned shapes,
and blocks every public native method while paused. It checks that typeText's
text matches a fresh, branded ActionGate action and consumes it once. Typing
yields after 16 Unicode characters; a pause cancels remaining chunks. A pause
also emits only the releases needed to end existing drags. This cleanup is
internal, not a new input command accepted while paused. Shortcut releases
are sent in reverse order and attempted even if injection fails.

The developer demo uses the same wrapper and global pause hotkey. The human
kept voice/mouth confirmation only, so its typing phase remains pending until
a real confirmation pipeline exists. It never fabricates confirmation evidence.

## Builds and checks

CI builds darwin-arm64 on macos-latest, darwin-x64 on macos-15-intel, and
win32-x64 on windows-latest. Artifacts are local `.node` files, with no
runtime download or automatic publishing. Windows release builds use the
static C runtime. Cross-compilation checks on macOS
can validate Windows Rust types and Clippy, but do not replace a Windows link
or runtime check. Permission prompts, Unicode output, double-clicks, and
mixed-DPI behavior require human checks in real applications.
