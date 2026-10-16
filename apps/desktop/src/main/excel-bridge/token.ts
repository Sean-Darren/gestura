import { randomBytes, timingSafeEqual } from 'node:crypto'

/** Per-session pairing token. Regenerated whenever the bridge server restarts. */
export function createPairingToken(): string {
  return randomBytes(32).toString('hex')
}

/** Constant-time comparison; rejects length mismatches without touching the buffer. */
export function tokensMatch(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'))
}
