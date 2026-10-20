export function isSpeechRendererUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    return new URL(value).pathname.endsWith('/speech/index.html')
  } catch {
    return false
  }
}

export function allowSpeechMicrophone(
  contentsId: number | undefined,
  captureId: number | undefined,
  permission: string,
  mediaTypes: readonly string[] | undefined,
  listening: boolean,
  isSpeechRequest = contentsId !== undefined && contentsId === captureId
): boolean {
  if (!isSpeechRequest) return false
  if (captureId === undefined) {
    console.error('[speech perm] denied: captureId is undefined (transport not started)')
    return false
  }
  if (!listening) {
    console.error('[speech perm] denied: not listening (state must be starting or listening)')
    return false
  }
  if (permission === 'speaker-selection') {
    if (mediaTypes && (mediaTypes.length !== 1 || mediaTypes[0] !== 'audio')) return false
    return true
  }
  if (permission !== 'media') {
    console.error(`[speech perm] denied: permission is "${permission}", expected "media"`)
    return false
  }
  if (!mediaTypes || mediaTypes.length !== 1 || mediaTypes[0] !== 'audio') {
    console.error(
      `[speech perm] denied: mediaTypes ${JSON.stringify(mediaTypes)}, expected ["audio"]`
    )
    return false
  }
  return true
}
