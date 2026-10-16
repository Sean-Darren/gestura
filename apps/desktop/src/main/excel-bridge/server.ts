import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http'
import type { Server as HttpsServer } from 'node:https'
import type { Duplex } from 'node:stream'
import type { AddressInfo } from 'node:net'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import {
  ExcelCommandSchema,
  ExcelEventSchema,
  EXCEL_WS_PATH,
  EXCEL_PAIRING_TOKEN_PLACEHOLDER
} from '@gestura/core'
import type { ExcelCommand, ExcelEvent } from '@gestura/core'
import { tokensMatch } from './token'
import type { DevCertificate } from './cert'

export interface ExcelServer {
  readonly token: string
  readonly port: number
  readonly url: string
  readonly clientCount: number
  broadcast(command: ExcelCommand): void
  subscribe(listener: (event: ExcelEvent) => void): () => void
  close(): Promise<void>
}

export interface ExcelServerOptions {
  token: string
  port?: number
  tls?: DevCertificate
  staticDir?: string
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
}

function contentType(path: string): string {
  for (const [extension, type] of Object.entries(CONTENT_TYPES)) {
    if (path.endsWith(extension)) return type
  }
  return 'application/octet-stream'
}

export async function startExcelServer(options: ExcelServerOptions): Promise<ExcelServer> {
  const token = options.token
  const staticDir = options.staticDir ? resolve(options.staticDir) : undefined

  const handler = (request: IncomingMessage, response: ServerResponse): void => {
    if (request.method !== 'GET' || !staticDir) {
      response.writeHead(404)
      response.end()
      return
    }
    const url = new URL(request.url ?? '/', 'https://localhost')
    const pathname = url.pathname === '/' ? '/taskpane.html' : url.pathname
    const segments = pathname.split('/')
    if (segments.includes('..')) {
      response.writeHead(404)
      response.end()
      return
    }
    const filePath = join(staticDir, ...segments.slice(1))
    if (!filePath.startsWith(staticDir) || !existsSync(filePath)) {
      response.writeHead(404)
      response.end()
      return
    }
    const raw = readFileSync(filePath)
    const body = filePath.endsWith('.html')
      ? raw.toString('utf8').replaceAll(EXCEL_PAIRING_TOKEN_PLACEHOLDER, token)
      : raw
    response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' })
    response.end(body)
  }

  const server: HttpServer | HttpsServer = options.tls
    ? createHttpsServer({ key: options.tls.key, cert: options.tls.cert }, handler)
    : createHttpServer(handler)

  const wss = new WebSocketServer({ noServer: true })
  const listeners = new Set<(event: ExcelEvent) => void>()

  const rejectUpgrade = (socket: Duplex, code: number, message: string): void => {
    socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', 'https://localhost')
    if (url.pathname !== EXCEL_WS_PATH) {
      rejectUpgrade(socket, 404, 'Not Found')
      return
    }
    const provided = url.searchParams.get('token') ?? ''
    if (!tokensMatch(token, provided)) {
      rejectUpgrade(socket, 401, 'Unauthorized')
      return
    }
    wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request))
  })

  wss.on('connection', (client: WebSocket) => {
    client.on('message', (data) => {
      let candidate: unknown
      try {
        candidate = JSON.parse(data.toString())
      } catch {
        return
      }
      const parsed = ExcelEventSchema.safeParse(candidate)
      if (!parsed.success) {
        client.close(4000, 'invalid event')
        return
      }
      for (const listener of listeners) listener(parsed.data)
    })
  })

  await new Promise<void>((resolveReady, rejectReady) => {
    server.once('error', rejectReady)
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.off('error', rejectReady)
      resolveReady()
    })
  })

  const address = server.address() as AddressInfo
  return {
    token,
    port: address.port,
    url: `${options.tls ? 'https' : 'http'}://localhost:${address.port}`,
    get clientCount(): number {
      return wss.clients.size
    },
    broadcast(command: ExcelCommand): void {
      const parsed = ExcelCommandSchema.parse(command)
      const frame = JSON.stringify(parsed)
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(frame)
      }
    },
    subscribe(listener: (event: ExcelEvent) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async close(): Promise<void> {
      for (const client of wss.clients) client.terminate()
      await new Promise<void>((resolveClose) => wss.close(() => resolveClose()))
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    }
  }
}
