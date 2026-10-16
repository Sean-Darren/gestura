---
title: ActionGate — GenAI confirmation security model
author: Glenn
date: 2026-10-15
branch: main
touches:
  - apps/desktop/src/main/action-gate/index.ts
---

ActionGate (apps/desktop/src/main/action-gate/index.ts:L68-L123) enforces hard rules 1-2: propose→confirm→mint flow. Only voice-confirm and held-mouth-gesture evidence accepted; blink/wink/dwell are EXPLICITLY rejected. ConfirmedAction uses branded type (unique symbol) with WeakSet validation. Actions hashed with SHA256, canonicalized JSON. 60s expiry. Integration write APIs must only accept ConfirmedAction. ActionGate is currently referenced by demo.ts and native index.test.ts — NOT yet wired into the main index.ts production path.
