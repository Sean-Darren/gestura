export function allowSpeechMicrophone(
  contentsId: number | undefined,
  captureId: number | undefined,
  permission: string,
  mediaTypes: readonly string[] | undefined,
  listening: boolean
): boolean {
  return (
    captureId !== undefined &&
    contentsId === captureId &&
    listening &&
    permission === 'media' &&
    mediaTypes?.length === 1 &&
    mediaTypes[0] === 'audio'
  )
}
