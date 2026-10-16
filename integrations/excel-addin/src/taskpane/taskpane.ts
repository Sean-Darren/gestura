import { EXCEL_PAIRING_TOKEN_GLOBAL } from '@gestura/core'
import { BridgeClient } from './bridge-client'
import { officeApi } from './office'

function status(message: string): void {
  const element = document.getElementById('status')
  if (element) element.textContent = message
}

Office.onReady(() => {
  const token = (window as unknown as Record<string, unknown>)[EXCEL_PAIRING_TOKEN_GLOBAL]
  if (typeof token !== 'string' || token.length === 0) {
    status('Gestura pairing token missing.')
    return
  }
  const client = new BridgeClient({ token, origin: window.location.origin, office: officeApi })
  client.connect()
  status('Connected to Gestura.')
})
