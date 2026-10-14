import type { NativeDisplay, CursorPoint } from '@gestura/native'

export function displayLocalDipToNative(display: NativeDisplay, x: number, y: number): CursorPoint {
  const factor = display.coordinateSpace === 'pixels' ? display.scaleFactor : 1
  return { x: display.bounds.x + x * factor, y: display.bounds.y + y * factor }
}

export function primaryCorners(display: NativeDisplay): CursorPoint[] {
  const inset = display.coordinateSpace === 'points' ? 20 / display.scaleFactor : 20
  const pixel = display.coordinateSpace === 'points' ? 1 / display.scaleFactor : 1
  const { x, y, width, height } = display.bounds
  if (width <= inset * 2 || height <= inset * 2)
    throw new Error('Display is too small for the demo')
  return [
    { x: x + inset, y: y + inset },
    { x: x + width - inset - pixel, y: y + inset },
    { x: x + width - inset - pixel, y: y + height - inset - pixel },
    { x: x + inset, y: y + height - inset - pixel }
  ]
}
