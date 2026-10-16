---
title: Network security and allowlist
author: Glenn
date: 2026-10-15
branch: main
touches:
  - apps/desktop/src/main/network/index.ts
  - apps/desktop/src/main/vision/ipc-policy.ts
---

Network security: installNetworkPolicy (apps/desktop/src/main/network/index.ts:L69-L90) blocks all outbound requests except: file/data/blob/app protocols, localOrigins, and hosts in config.network.allowlist. Only packages/genai may make outbound requests. Called from main/index.ts:L358-L368 apply(). Vision IPC policy (apps/desktop/src/main/vision/ipc-policy.ts) gates which channels each renderer role (control/overlay/vision) can send. Trusted web contents tracked by ID. Local logging opt-in via logging.enabled config, user-deletable (hard rule 5).
