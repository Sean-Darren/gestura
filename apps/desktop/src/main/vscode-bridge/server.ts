import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { CodeCommandSchema, CodeEventSchema } from '@gestura/core'
import type { CodeCommand, CodeEvent } from '@gestura/core'
import { tokensMatch } from '../excel-bridge/token'
export interface CodeServer {
  readonly port: number
  readonly revision: number
  readonly connected: boolean
  send(command: CodeCommand): void
  request(
    command: Omit<Extract<CodeCommand, { id: string }>, 'id'> & Record<string, unknown>
  ): Promise<CodeEvent | undefined>
  close(): Promise<void>
}
export async function startCodeServer(token: string): Promise<CodeServer> {
  const server = createServer((_req, res) => {
    res.writeHead(404)
    res.end()
  })
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 128 * 1024,
    perMessageDeflate: false
  })
  let revision = 0
  let paused = true
  const listeners = new Set<(event: CodeEvent) => void>()
  server.on('upgrade', (req, socket, head) => {
    const auth = req.headers.authorization ?? ''
    if (
      req.url !== '/vscode' ||
      req.headers.origin ||
      !tokensMatch(`Bearer ${token}`, auth) ||
      sockets.clients.size
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    sockets.handleUpgrade(req, socket, head, (client) => sockets.emit('connection', client))
  })
  sockets.on('connection', (client) => {
    revision++
    client.send(JSON.stringify({ type: 'pause', paused }))
    client.on('close', () => revision++)
    client.on('error', () => {})
    client.on('message', (data) => {
      try {
        const event = CodeEventSchema.parse(JSON.parse(data.toString()))
        for (const listener of listeners) listener(event)
      } catch {
        client.close(4000, 'Invalid message')
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    port: (server.address() as AddressInfo).port,
    get revision() {
      return revision
    },
    get connected() {
      return sockets.clients.size === 1
    },
    send(command: CodeCommand) {
      if (command.type === 'pause') paused = command.paused
      const data = JSON.stringify(CodeCommandSchema.parse(command))
      for (const client of sockets.clients)
        if (client.readyState === WebSocket.OPEN) client.send(data)
    },
    async request(
      this: CodeServer,
      command: Omit<Extract<CodeCommand, { id: string }>, 'id'> & Record<string, unknown>
    ): Promise<CodeEvent | undefined> {
      if (!this.connected) return undefined
      const id = randomUUID(),
        epoch = revision
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          listeners.delete(receive)
          resolve(undefined)
        }, 5000)
        const receive = (event: CodeEvent): void => {
          if (event.id !== id) return
          clearTimeout(timer)
          listeners.delete(receive)
          resolve(epoch === revision ? event : undefined)
        }
        listeners.add(receive)
        this.send(CodeCommandSchema.parse({ ...command, id }))
      })
    },
    async close() {
      for (const client of sockets.clients) client.terminate()
      await new Promise<void>((resolve) => sockets.close(() => resolve()))
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}
