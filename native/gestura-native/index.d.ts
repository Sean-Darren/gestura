import type { UiElement, ForegroundApp } from '@gestura/core'
export type { UiElement, ForegroundApp } from '@gestura/core'
export type MouseButton = 'left' | 'right' | 'middle'
export interface CursorPoint {
  x: number
  y: number
}
export interface NativeDisplay {
  id: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  primary: boolean
  coordinateSpace: 'points' | 'pixels'
}
/** Raw addon interface. Desktop callers use the validated main-process wrapper. */
export interface NativeInput {
  captureFocusedText(token: string): Promise<{ token: string; selectedText: string } | null>
  checkTextTarget(token: string, text: string, after: boolean): Promise<boolean>
  selectInsertedText(token: string, text: string): Promise<boolean>
  elementAt(x: number, y: number): Promise<UiElement | null>
  elementsNear(x: number, y: number, radiusPx: number): Promise<UiElement[]>
  foregroundApp(): Promise<ForegroundApp>
  moveTo(x: number, y: number): void
  click(button: MouseButton): void
  doubleClick(): void
  mouseDown(button: MouseButton): void
  mouseUp(button: MouseButton): void
  scroll(dx: number, dy: number): void
  typeText(text: string): void
  keyCombo(keys: string[]): void
  getCursorPos(): CursorPoint
  getDisplays(): NativeDisplay[]
  hasInputPermission(): boolean
  requestInputPermission(): boolean
}
export function loadNativeBinding(): NativeInput & { protectPairingDirectory(path: string): void }
