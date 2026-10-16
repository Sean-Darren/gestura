import { join } from 'node:path'
import { createPairingToken } from './token'
import { loadOrCreateDevCertificate } from './cert'
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
  const tls = loadOrCreateDevCertificate(join(options.userDataDir, 'excel-dev-cert'))
  const server = await startExcelServer({
    token: createPairingToken(),
    port: options.port,
    tls,
    staticDir: options.staticDir
  })
  const bridge = new ExcelBridge({ server, shareSampleValues: options.shareSampleValues })
  return { server, bridge }
}
