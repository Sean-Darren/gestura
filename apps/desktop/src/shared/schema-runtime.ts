import { z } from 'zod'
// Keep validation compatible with the renderer's strict no-eval CSP.
z.config({ jitless: true })
