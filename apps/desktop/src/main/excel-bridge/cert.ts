import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import selfsigned from 'selfsigned'

export interface DevCertificate {
  key: string
  cert: string
  certPath: string
  /** First generation — user needs to trust this cert in their OS keychain. */
  created: boolean
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
    return {
      key: readFileSync(keyPath, 'utf8'),
      cert: readFileSync(certPath, 'utf8'),
      certPath,
      created: false
    }
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
  return { key: pems.private, cert: pems.cert, certPath, created: true }
}

/**
 * Microsoft office-addin-dev-certs trust chain. When present this is preferred
 * because Office add-in WebViews require a CA-trusted cert, not self-signed.
 * Install via: `npx office-addin-dev-certs install`
 */
export function loadOfficeDevCertificate(): DevCertificate | undefined {
  const dir = join(homedir(), '.office-addin-dev-certs')
  const keyPath = join(dir, 'localhost.key')
  const certPath = join(dir, 'localhost.crt')
  if (existsSync(certPath) && existsSync(keyPath)) {
    return {
      key: readFileSync(keyPath, 'utf8'),
      cert: readFileSync(certPath, 'utf8'),
      certPath,
      created: false
    }
  }
  return undefined
}
