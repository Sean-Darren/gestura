import { randomBytes, timingSafeEqual } from 'node:crypto'

/** Per-session pairing token. Regenerated whenever the bridge server restarts. */
export function createPairingToken(): string {
  return randomBytes(32).toString('hex')
}

/** Constant-time comparison; rejects length mismatches without touching the buffer. */
export function tokensMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, 'utf8'),
    right = Buffer.from(provided, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}
