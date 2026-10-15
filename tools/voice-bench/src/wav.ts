export function readMonoWav(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (start: number, length: number): string =>
    String.fromCharCode(...bytes.subarray(start, start + length))
  if (bytes.length < 44 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE')
    throw new Error('Expected RIFF WAV')
  let format = 0,
    bits = 0,
    rate = 0,
    channels = 0
  let audio: Uint8Array | undefined
  for (let i = 12; i + 8 <= bytes.length;) {
    const size = view.getUint32(i + 4, true)
    if (i + 8 + size > bytes.length) throw new Error('Truncated WAV')
    if (text(i, 4) === 'fmt ' && size >= 16) {
      format = view.getUint16(i + 8, true)
      channels = view.getUint16(i + 10, true)
      rate = view.getUint32(i + 12, true)
      bits = view.getUint16(i + 22, true)
    } else if (text(i, 4) === 'data') audio = bytes.subarray(i + 8, i + 8 + size)
    i += 8 + size + (size % 2)
  }
  if (
    !audio ||
    rate !== 16000 ||
    channels !== 1 ||
    !((format === 1 && bits === 16) || (format === 3 && bits === 32))
  )
    throw new Error('Fixtures must be mono 16 kHz PCM16 or Float32 WAV')
  const sampleBytes = bits / 8
  if (audio.length % sampleBytes) throw new Error('Incomplete WAV sample')
  const pcm = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  return Float32Array.from({ length: audio.length / sampleBytes }, (_, i) => {
    const value = format === 1 ? pcm.getInt16(i * 2, true) / 32768 : pcm.getFloat32(i * 4, true)
    if (!Number.isFinite(value) || Math.abs(value) > 1) throw new Error('Invalid PCM')
    return value
  })
}
