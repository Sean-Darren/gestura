import { afterEach, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { startCodeServer } from './server'
import type { CodeServer } from './server'
let server: CodeServer | undefined
const clients: WebSocket[] = []
afterEach(async () => {
  for (const client of clients.splice(0)) client.terminate()
  await server?.close()
  server = undefined
})
function connect(token: string, origin?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${server!.port}/vscode`, {
      headers: { Authorization: `Bearer ${token}`, ...(origin ? { Origin: origin } : {}) }
    })
    clients.push(client)
    client.on('error', reject)
    client.once('open', () => resolve(client))
  })
}
it('pairs one local extension, rejects wrong tokens, browser origins and second clients', async () => {
  server = await startCodeServer('a'.repeat(64))
  await expect(connect('wrong')).rejects.toThrow()
  await expect(connect('a'.repeat(64), 'https://example.com')).rejects.toThrow()
  await connect('a'.repeat(64))
  expect(server.connected).toBe(true)
  await expect(connect('a'.repeat(64))).rejects.toThrow()
})
it('validates both directions and matches replies to individual requests', async () => {
  server = await startCodeServer('b'.repeat(64))
  const client = await connect('b'.repeat(64))
  client.on('message', (bytes) => {
    const command = JSON.parse(bytes.toString()) as { type: string; id: string }
    if (command.type === 'context')
      client.send(JSON.stringify({ type: 'context', id: command.id, snapshot: null }))
  })
  expect(await server.request({ type: 'context' })).toMatchObject({
    type: 'context',
    snapshot: null
  })
  const closed = new Promise<number>((resolve) => client.once('close', resolve))
  client.send(JSON.stringify({ type: 'execute', code: 'never' }))
  expect(await closed).toBe(4000)
})
