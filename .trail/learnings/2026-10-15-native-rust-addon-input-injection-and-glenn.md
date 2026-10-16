---
title: Native Rust addon — input injection and UI queries
author: Glenn
date: 2026-10-15
branch: main
---

Native addon (native/gestura-native/) is Rust + napi-rs v3, edition 2024, rust-version 1.88. lib.rs exports 14 napi functions through thread-local PlatformInput singleton: move_to, click, double_click, mouse_down, mouse_up, scroll, type_text, key_combo, get_cursor_pos, get_displays, has_input_permission, request_input_permission. macOS uses CGEvent + Accessibility API (core-graphics 0.25, core-foundation 0.10). Windows uses SendInput + UI Automation (windows 0.62, windows-sys 0.61). Crate-level deny: no unwrap/expect outside tests. JS bridge: index.mjs loads platform binary, index.d.ts has TS types, mock/index.ts (MockNativeInput with 15 callers to record) fakes for tests.
