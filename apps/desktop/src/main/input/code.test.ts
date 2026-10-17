import { expect, it, vi } from 'vitest'
import { InputController } from './controller'
import { PauseController } from '../pause'
import { DEFAULT_PALETTE_CONFIG } from '@gestura/core'
import { createNativeInput } from '../native'
import { MockNativeInput } from '@gestura/native/mock'
import type { CodeBridge } from '../vscode-bridge/bridge'
import type { CodeRouter } from '@gestura/genai'
import type { CodeResponse, CodeSnapshot } from '@gestura/core'

it('routes a gaze-composed request to code and rejects click confirmation on its card', async () => {
  const pause = new PauseController(),
    write = vi.fn(async () => true)
  const snapshot: CodeSnapshot = {
    token: crypto.randomUUID(),
    context: { fileName: 'a.ts', languageId: 'typescript', selection: '', surroundingLines: [] }
  }
  const response: CodeResponse = {
    status: 'ok',
    code: 'const a = 1',
    insertMode: 'insert_at_cursor',
    explanation: { en: 'Create a constant', zh_hk: '新增常數' }
  }
  const generate = vi.fn(async () => response)
  const input = new InputController({
    pause,
    bridge: createNativeInput(pause, () => new MockNativeInput()),
    settings: { ...DEFAULT_PALETTE_CONFIG, gazeOnly: true },
    now: () => 1000,
    foreground: async () => ({ appId: 'Code.exe', windowTitle: 'a.ts' }),
    display: () => ({ width: 1280, height: 800 }),
    publish: vi.fn(),
    listening: vi.fn(),
    gazeOnly: vi.fn(),
    dragging: vi.fn(),
    pointerClick: vi.fn(),
    clipboard: async () => '',
    save: async () => {},
    codeRouter: { generate } as unknown as CodeRouter,
    codeBridge: {
      getContext: async () => snapshot,
      prepare: async () => ({ snapshot, response, preview: crypto.randomUUID(), revision: 1 }),
      write,
      cancel: vi.fn()
    } as unknown as CodeBridge
  })
  await input.control({ operation: 'activate', id: 'palette' })
  for (let page = 0; !input.state.tiles.some((t) => t.id === 'compose:code') && page < 10; page++)
    await input.control({ operation: 'activate', id: 'next' })
  await input.control({ operation: 'activate', id: 'compose:code' })
  expect(input.state.composer).toBe('code')
  await input.control({ operation: 'draft', text: 'create a constant' })
  await input.control({ operation: 'activate', id: 'compose:done' })
  await input.settle()
  expect(generate).toHaveBeenCalledOnce()
  expect(input.state.formula?.targetKind).toBe('code')
  const bounds = input.state.formula!.bounds!
  expect(input.click({ x: bounds.x + 20, y: bounds.y + 20 })).toBe(true)
  expect(write).not.toHaveBeenCalled()
  await input.control({ operation: 'activate', id: 'formula:correct' })
  expect(input.state.composer).toBe('code')
  await input.control({ operation: 'draft', text: 'use b instead' })
  await input.control({ operation: 'activate', id: 'compose:done' })
  await input.settle()
  expect(input.state.formula?.correction).toBe(1)
  expect(generate).toHaveBeenCalledTimes(2)
  expect(write).not.toHaveBeenCalled()
  input.dispose()
})
