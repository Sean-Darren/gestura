export function allowVisionCamera(
  contentsId: number | undefined,
  visionId: number | undefined,
  permission: string,
  mediaTypes: readonly string[] | undefined
): boolean {
  return (
    visionId !== undefined &&
    contentsId === visionId &&
    permission === 'media' &&
    mediaTypes?.length === 1 &&
    mediaTypes[0] === 'video'
  )
}
