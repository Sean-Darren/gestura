import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import selfsigned from 'selfsigned'

export interface DevCertificate {
  key: string
  cert: string
  certPath: string
}

/**
 * A self-signed certificate for `localhost` / `127.0.0.1`, generated once and
 * persisted so the human only has to trust it a single time. Trust is a manual,
 * per-platform step (macOS Keychain / Windows cert store) documented in the ADR.
 */
export function loadOrCreateDevCertificate(directory: string): DevCertificate {
  const keyPath = join(directory, 'localhost-key.pem')
  const certPath = join(directory, 'localhost-cert.pem')
  if (existsSync(certPath) && existsSync(keyPath)) {
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8'), certPath }
  }
  const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' }
        ]
      }
    ]
  })
  mkdirSync(directory, { recursive: true })
  writeFileSync(keyPath, pems.private, { mode: 0o600 })
  writeFileSync(certPath, pems.cert)
  return { key: pems.private, cert: pems.cert, certPath }
}
