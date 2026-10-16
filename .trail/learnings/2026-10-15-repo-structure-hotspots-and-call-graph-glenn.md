---
title: Repo structure — hotspots and call graph
author: Glenn
date: 2026-10-15
branch: main
touches:
  - apps/desktop/src/main/index.ts
---

Repo stats from trail build: 146 files, 2032 symbols, 3570 edges across JS/TS/TSX/Rust. Key hotspots: createIpcEnvelope (13 callers), PauseController (11 callers), testFrame (11 callers), parseFixture (9 callers), record/MockNativeInput (15 callers), physicalBounds (6 callers). Main index.ts (apps/desktop/src/main/index.ts) is largest at 664 lines — registerIpc() at L234-L350 is central router. Top-level dirs: apps/desktop/ (Electron), packages/{core,pointer,gestures,intent,genai} (pure logic), native/gestura-native/ (Rust napi-rs), tools/{replay,pointing-bench,voice-bench,formula-bench}, integrations/{excel-addin,vscode}, fixtures/ (landmarks JSONL), models/ (gitignored). Conventions: TS strict ESM no-any no-default-exports-in-packages, Vitest, pnpm verify (lint+typecheck+test), no git writes (hard rule 11).
