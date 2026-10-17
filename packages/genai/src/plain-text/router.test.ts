import { expect, it, vi } from 'vitest'
import { PlainTextRouter } from './router'
import { MockProvider } from '../providers/mock'
const request = {
  operation: 'translate-en' as const,
  instruction: '',
  selectedText: '你好',
  register: 'standard_written' as const
}
const response = {
  status: 'ok',
  text: 'Hello',
  register: 'standard_written',
  explanation: 'Translated.'
}
it('uses MockProvider for English ↔ Cantonese register requests without extra context', async () => {
  const provider = new MockProvider({
    responses: {
      [JSON.stringify(request)]: response,
      [JSON.stringify({ ...request, register: 'colloquial_cantonese' })]: {
        ...response,
        text: '你好呀',
        register: 'colloquial_cantonese'
      }
    }
  })
  const router = new PlainTextRouter(provider)
  expect((await router.generate(request)).text).toBe('Hello')
  expect((await router.generate({ ...request, register: 'colloquial_cantonese' })).text).toBe(
    '你好呀'
  )
  expect((await router.generate(request)).text).toBe('Hello')
})
it('repairs an invalid schema/register once and stops after two invalid responses', async () => {
  const generate = vi
    .fn()
    .mockResolvedValueOnce({ json: { ...response, register: 'colloquial_cantonese' } })
    .mockResolvedValueOnce({ json: response })
  expect(await new PlainTextRouter({ id: 'fake', generate }).generate(request)).toEqual(response)
  expect(generate).toHaveBeenCalledTimes(2)
  const invalid = vi.fn().mockResolvedValue({ json: {} })
  await expect(
    new PlainTextRouter({ id: 'fake', generate: invalid }).generate(request)
  ).rejects.toThrow('one retry')
  expect(invalid).toHaveBeenCalledTimes(2)
})
it('rejects empty translation context and cancelled generation before contacting a provider', async () => {
  const generate = vi.fn(),
    router = new PlainTextRouter({ id: 'fake', generate })
  await expect(router.generate({ ...request, selectedText: '' })).rejects.toThrow()
  const abort = new AbortController()
  abort.abort()
  await expect(router.generate(request, abort.signal)).rejects.toThrow()
  expect(generate).not.toHaveBeenCalled()
})
