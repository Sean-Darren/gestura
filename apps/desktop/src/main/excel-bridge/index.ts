import { join } from 'node:path'
import { createPairingToken } from './token'
import { loadOrCreateDevCertificate, loadOfficeDevCertificate } from './cert'
import { startExcelServer } from './server'
import type { ExcelServer } from './server'
import { ExcelBridge } from './bridge'

export { ExcelBridge } from './bridge'
export { startExcelServer } from './server'
export type { ExcelServer } from './server'
export { createPairingToken } from './token'

export interface ExcelBridgeHandle {
  server: ExcelServer
  bridge: ExcelBridge
  /** Path to the self-signed TLS certificate the loopback server uses. */
  certPath: string
  /** First generation — the human must trust this cert in their OS keychain. */
  certCreated: boolean
}

export interface StartExcelBridgeOptions {
  userDataDir: string
  staticDir: string
  port: number
  shareSampleValues: boolean
}

/** Start the loopback HTTPS server + token-paired WebSocket and its bridge. */
export async function startExcelBridge(
  options: StartExcelBridgeOptions
): Promise<ExcelBridgeHandle> {
  const tls =
    loadOfficeDevCertificate() ??
    loadOrCreateDevCertificate(join(options.userDataDir, 'excel-dev-cert'))
  const server = await startExcelServer({
    token: createPairingToken(),
    port: options.port,
    tls,
    staticDir: options.staticDir
  })
  const bridge = new ExcelBridge({ server, shareSampleValues: options.shareSampleValues })
  return { server, bridge, certPath: tls.certPath, certCreated: tls.created }
}
