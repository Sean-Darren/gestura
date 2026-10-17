import { expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { CodeCommandSchema } from '@gestura/core'
import { EditorTransactions } from '../../../../../integrations/vscode/src/transactions'
import type { EditorState } from '../../../../../integrations/vscode/src/transactions'
import { startCodeServer } from './server'
import { CodeBridge } from './bridge'
import { CodeController } from './controller'
import { PauseController } from '../pause'
import { ActionGate } from '../action-gate'

it('runs local bridge → context → proposal → fresh confirmation → edit → confirmed restore', async () => {
  let now = 1000
  let state: EditorState = {
    uri: 'file:///private/a.ts',
    version: 1,
    fileName: 'a.ts',
    languageId: 'typescript',
    text: 'old',
    start: 0,
    end: 3,
    cursor: 3
  }
  const apply = vi.fn(async (_s: EditorState, start: number, end: number, text: string) => {
    state = {
      ...state,
      text: state.text.slice(0, start) + text + state.text.slice(end),
      version: state.version + 1
    }
    return true
  })
  const editor = new EditorTransactions(
    { current: () => state, apply, preview: async () => true, clear: vi.fn() },
    () => now
  )
  const server = await startCodeServer('c'.repeat(64)),
    pause = new PauseController(),
    bridge = new CodeBridge(server, pause)
  const client = new WebSocket(`ws://127.0.0.1:${server.port}/vscode`, {
    headers: { Authorization: `Bearer ${'c'.repeat(64)}` }
  })
  client.on('message', (bytes) => {
    void editor.handle(CodeCommandSchema.parse(JSON.parse(bytes.toString()))).then((event) => {
      if (event) client.send(JSON.stringify(event))
    })
  })
  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve)
    client.on('error', reject)
  })
  const controller = new CodeController({
    gate: new ActionGate(
      () => now,
      () => now
    ),
    bridge,
    pause,
    now: () => now,
    foreground: async () => ({ appId: 'Code.exe', windowTitle: 'a.ts' }),
    display: () => ({ width: 1280, height: 800 }),
    publish: vi.fn(),
    generate: async (request) => {
      expect(Object.keys(request.context)).toEqual([
        'languageId',
        'fileName',
        'selection',
        'surroundingLines'
      ])
      expect(JSON.stringify(request)).not.toContain('/private')
      return {
        status: 'ok',
        code: 'new',
        insertMode: 'replace_selection',
        explanation: { en: 'Replace text', zh_hk: '取代文字' }
      }
    }
  })
  const present = (): void => {
    while (controller.state.reviewPage < controller.state.reviewPages - 1) controller.review(1)
    controller.present(controller.state.proposalId!)
    now++
  }
  try {
    controller.start('replace old')
    await controller.settle()
    expect(controller.state.phase).toBe('proposed')
    expect(apply).not.toHaveBeenCalled()
    present()
    await controller.confirm({ kind: 'voice-confirm', tSpeechStart: now })
    expect(state.text).toBe('new')
    expect(apply).toHaveBeenCalledOnce()
    await controller.undo()
    expect(apply).toHaveBeenCalledOnce()
    present()
    await controller.confirm({ kind: 'held-mouth-gesture' })
    expect(state.text).toBe('old')
    expect(apply).toHaveBeenCalledTimes(2)
  } finally {
    controller.dispose()
    bridge.dispose()
    client.terminate()
    await server.close()
  }
})
