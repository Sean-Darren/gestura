import { expect, it } from 'vitest'
import { allowSpeechMicrophone, isSpeechRendererUrl } from './permissions'
it('recognizes only the dedicated speech renderer URL', () => {
  expect(isSpeechRendererUrl('http://localhost:5173/speech/index.html')).toBe(true)
  expect(isSpeechRendererUrl('file:///Gestura/apps/desktop/out/renderer/speech/index.html')).toBe(
    true
  )
  expect(isSpeechRendererUrl('http://localhost:5173/control/index.html')).toBe(false)
  expect(isSpeechRendererUrl('http://localhost:5173/vision/index.html')).toBe(false)
  expect(isSpeechRendererUrl(undefined)).toBe(false)
})
it('permits audio only in the active hidden capture renderer', () => {
  expect(allowSpeechMicrophone(1, 1, 'media', ['audio'], true)).toBe(true)
  expect(allowSpeechMicrophone(3, 4, 'media', ['audio'], true, true)).toBe(true)
  expect(allowSpeechMicrophone(3, 4, 'media', ['audio'], true, false)).toBe(false)
  expect(allowSpeechMicrophone(3, 4, 'speaker-selection', ['audio'], true, true)).toBe(true)
  expect(allowSpeechMicrophone(3, 4, 'speaker-selection', ['video'], true, true)).toBe(false)
  expect(allowSpeechMicrophone(undefined, undefined, 'media', ['audio'], true)).toBe(false)
  expect(allowSpeechMicrophone(1, 1, 'media', ['audio'], false)).toBe(false)
  expect(allowSpeechMicrophone(2, 1, 'media', ['audio'], true)).toBe(false)
  expect(allowSpeechMicrophone(1, 1, 'media', ['audio', 'video'], true)).toBe(false)
  expect(allowSpeechMicrophone(1, 1, 'media', ['video'], true)).toBe(false)
  expect(allowSpeechMicrophone(1, 1, 'geolocation', ['audio'], true)).toBe(false)
})
