import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import {
  EXCEL_WS_PATH,
  EXCEL_PAIRING_TOKEN_PLACEHOLDER,
  EXCEL_PAIRING_TOKEN_GLOBAL
} from '@gestura/core'
import { startExcelServer } from './server'
import type { ExcelServer } from './server'

const servers: ExcelServer[] = []

async function start(token = 'a'.repeat(64)): Promise<ExcelServer> {
  const server = await startExcelServer({ token })
  servers.push(server)
  return server
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const onError = (error: Error): void => {
      ws.off('open', onOpen)
      reject(error)
    }
    const onOpen = (): void => {
      ws.off('error', onError)
      resolve(ws)
    }
    ws.once('error', onError)
    ws.once('open', onOpen)
  })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()))
})

describe('Excel bridge server', () => {
  it('accepts a client that presents the token', async () => {
    const server = await start()
    const ws = await connect(`ws://127.0.0.1:${server.port}${EXCEL_WS_PATH}?token=${server.token}`)
    expect(server.clientCount).toBe(1)
    ws.close()
  })

  it('rejects a client without the token', async () => {
    const server = await start()
    await expect(connect(`ws://127.0.0.1:${server.port}${EXCEL_WS_PATH}`)).rejects.toThrow()
    expect(server.clientCount).toBe(0)
  })

  it('rejects a client with a wrong token', async () => {
    const server = await start()
    await expect(
      connect(`ws://127.0.0.1:${server.port}${EXCEL_WS_PATH}?token=${'b'.repeat(64)}`)
    ).rejects.toThrow()
    expect(server.clientCount).toBe(0)
  })

  it('broadcasts commands to the connected client', async () => {
    const server = await start()
    const ws = await connect(`ws://127.0.0.1:${server.port}${EXCEL_WS_PATH}?token=${server.token}`)
    const received = new Promise<string>((resolve) =>
      ws.once('message', (data) => resolve(data.toString()))
    )
    server.broadcast({
      type: 'selectRange',
      id: 'c0ffee00-0000-4000-8000-000000000000',
      address: 'A1:A10'
    })
    const frame = JSON.parse(await received)
    expect(frame).toMatchObject({ type: 'selectRange', address: 'A1:A10' })
    ws.close()
  })

  it('forwards validated client events to subscribers', async () => {
    const server = await start()
    const ws = await connect(`ws://127.0.0.1:${server.port}${EXCEL_WS_PATH}?token=${server.token}`)
    const event = new Promise<unknown>((resolve) => server.subscribe(resolve))
    ws.send(JSON.stringify({ type: 'ready' }))
    await expect(event).resolves.toEqual({ type: 'ready' })
    ws.close()
  })

  it('drops a malformed client event', async () => {
    const server = await start()
    const ws = await connect(`ws://127.0.0.1:${server.port}${EXCEL_WS_PATH}?token=${server.token}`)
    let received = false
    server.subscribe(() => {
      received = true
    })
    ws.send(JSON.stringify({ type: 'not-a-real-event' }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(received).toBe(false)
    ws.close()
  })

  it('serves HTML with the pairing token injected server-side', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gestura-excel-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'taskpane.html'),
      `<script>window.${EXCEL_PAIRING_TOKEN_GLOBAL} = "${EXCEL_PAIRING_TOKEN_PLACEHOLDER}";</script>`
    )
    const token = 'c'.repeat(64)
    const server = await startExcelServer({ token, staticDir: dir })
    servers.push(server)
    const response = await fetch(`${server.url}/taskpane.html`)
    const html = await response.text()
    expect(html).toContain(`window.${EXCEL_PAIRING_TOKEN_GLOBAL} = "${token}";`)
    expect(html).not.toContain(EXCEL_PAIRING_TOKEN_PLACEHOLDER)
  })
})
