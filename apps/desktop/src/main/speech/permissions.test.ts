import { expect, it } from 'vitest'
import { allowSpeechMicrophone } from './permissions'
it('permits audio only in the active hidden capture renderer', () => {
  expect(allowSpeechMicrophone(1, 1, 'media', ['audio'], true)).toBe(true)
  expect(allowSpeechMicrophone(undefined, undefined, 'media', ['audio'], true)).toBe(false)
  expect(allowSpeechMicrophone(1, 1, 'media', ['audio'], false)).toBe(false)
  expect(allowSpeechMicrophone(2, 1, 'media', ['audio'], true)).toBe(false)
  expect(allowSpeechMicrophone(1, 1, 'media', ['audio', 'video'], true)).toBe(false)
  expect(allowSpeechMicrophone(1, 1, 'media', ['video'], true)).toBe(false)
  expect(allowSpeechMicrophone(1, 1, 'geolocation', ['audio'], true)).toBe(false)
})
