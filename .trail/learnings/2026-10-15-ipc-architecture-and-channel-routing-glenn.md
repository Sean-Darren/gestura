---
title: IPC architecture and channel routing
author: Glenn
date: 2026-10-15
branch: main
cost: { minutes: 1, tokens: 101022 }
touches:
  - apps/desktop/src/preload/index.ts
  - apps/desktop/src/main/index.ts
---

Gestura is an Electron+React+TypeScript hands-free input tool. Monorepo with pnpm workspaces. core package (@gestura/core) defines all zod schemas for IPC — IPC_CHANNELS (20 channels), IPC_PAYLOAD_SCHEMAS, createIpcEnvelope/parseIpcEnvelope validate every message crossing the Electron boundary via the single 'gestura:ipc' transport channel. The preload (apps/desktop/src/preload/index.ts) exposes only typed on/send through contextBridge. Main process registerIpc() in apps/desktop/src/main/index.ts:L234-L350 routes all IPC. createIpcEnvelope is the most-called function in packages/core (13 callers).
