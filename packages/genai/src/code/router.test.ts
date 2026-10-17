import { expect, it, vi } from 'vitest'
import { CodeRouter } from './router'
import type { CodeRequest } from '@gestura/core'
const request: CodeRequest = {
  utterance: 'add a greeting',
  lang: 'yue',
  context: {
    languageId: 'typescript',
    fileName: 'a.ts',
    selection: '',
    surroundingLines: ['// test']
  },
  history: []
}
const json = {
  status: 'ok',
  code: 'const greeting = "你好"',
  insertMode: 'insert_at_cursor',
  explanation: { en: 'Greeting', zh_hk: '問候' }
}
it('validates structured code with exactly one repair attempt', async () => {
  const generate = vi.fn().mockResolvedValueOnce({ json: {} }).mockResolvedValueOnce({ json })
  expect(await new CodeRouter({ id: 'mock', generate }).generate(request)).toEqual(json)
  expect(generate).toHaveBeenCalledTimes(2)
  const sent = JSON.stringify(generate.mock.calls[0])
  expect(sent).toContain('a.ts')
  expect(sent).not.toContain('file:///')
})
it('stops after a second invalid response and honors cancellation', async () => {
  const generate = vi.fn().mockResolvedValue({ json: {} }),
    router = new CodeRouter({ id: 'mock', generate })
  await expect(router.generate(request)).rejects.toThrow('one retry')
  expect(generate).toHaveBeenCalledTimes(2)
  const abort = new AbortController()
  abort.abort()
  await expect(router.generate(request, abort.signal)).rejects.toThrow()
  expect(generate).toHaveBeenCalledTimes(2)
})
it('carries bounded correction history', async () => {
  const generate = vi.fn().mockResolvedValue({ json })
  await new CodeRouter({ id: 'mock', generate }).generate({
    ...request,
    utterance: 'use Chinese',
    history: [
      { role: 'user', content: 'greet' },
      { role: 'assistant', content: 'old code' }
    ]
  })
  expect(JSON.stringify(generate.mock.calls[0])).toContain('old code')
})
