# 0016 — Selected-field text proposals

Date: 2026-10-18. Status: implemented; real OS field/UI acceptance pending.

## Decision

Extend the existing accessibility worker with focused-text operations. Windows
uses UIA on its COM thread; macOS uses AX on its dedicated worker. Native receipt
objects retain control identity, original range/selected text and capture time;
main gets only an opaque UUID and selected text. Reject own windows, unfocused,
disabled, read-only, password and unsupported controls. Known command/terminal
hosts and VS Code are not passive text destinations and are excluded locally.

Read the user's selection through TextPattern.GetSelection / AXSelectedText.
Never retrieve the full field value or perform a screen/clipboard fallback.
Windows reconstructs an anchor by TextUnit_Character navigation and verifies
endpoint equality; it never assumes CompareEndpoints returns a character count.
DocumentRange is used only as range metadata and collapsed/moved before any
GetText call. Only selected or just-inserted text is retrieved. macOS uses
AXSelectedTextRange and AXStringForRange for the bounded owned insertion.

References: [UIA Move](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomationtextrange-move),
[AXSelectedTextRange](https://developer.apple.com/documentation/applicationservices/kaxselectedtextrangeattribute),
[AXStringForRange](https://developer.apple.com/documentation/applicationservices/kaxstringforrangeparameterizedattribute).

The provider request contains operation, the user's instruction, original
selected text and requested register only. Shared strict Zod schemas bound
selection/output to 10,000 UTF-16 units, reject invalid control/surrogate text,
and validate status/text/register/explanation. One schema-repair attempt is
allowed under the existing eight-second timeout. No local plain-text fallback
or new dependency is added. Q12 Traditional HK Chinese remains in force.

Register switching always starts from the original selected text/request,
revokes the old ActionGate ID and requires fresh review/confirmation. Per the
maintainer's explicit decision, English translations switch to Cantonese with
口語; 書面語 returns to the original English request.

Only an ActionGate-minted plain-text capability can call the guarded text path.
NativeBridge validates text and field token, consumes the capability once, checks
focus/selection before typing and verifies each emitted Unicode chunk. Pause
revision is checked across every await. A mismatch can stop a partial insertion;
it never triggers an automatic retry or broad undo.

Undo uses a separate proposal with original selected text, the native field
receipt and the exact expected insertion. Only after fresh confirmation does
native recheck/select that insertion. NativeBridge then types the original
selection or sends one Backspace for a previously empty selection. No Ctrl+Z,
clipboard replacement, message-send or execution command is introduced.

UI reuses the existing green/system-font proposal card. Energy/rhythm/motion
remain 1/1/1. A 64px register tile is the additional action; pagination and the
existing dwell controls remain. Plain text uses a system font rather than
formula monospace, with conservative CJK pagination and one-line review pages
on shorter displays. Schema tests verify paging and tile bounds; the browser
preview permission was declined, so no visual pass is claimed.

## Limits

Arbitrary OS fields expose no shared version/transaction API. Focus, endpoints
and expected selected/inserted text are optimistic guards, not cross-application
atomic isolation. Known-host exclusion is not an application sandbox. Uncertain
or interrupted outcomes require checking the destination; automatic restore is
unavailable unless the recorded range is verified. Native worker queries may
fail when busy or unsupported. Expiry is 60 seconds from native capture.

Tests use MockProvider and MockNativeInput for the full request/confirmation/
register/undo flow, including gaze-only input wiring, strict privacy schemas,
wrong registers, stale capabilities, changed fields, pause, Unicode and partial
insertion. Rust worker dispatch is tested without querying a live field.
Cross-target Clippy validates compilation; actual Windows/AX provider behavior,
IME and visible layout remain manual checks in plain-text-setup.md.
