import type { CursorPoint, MouseButton, NativeDisplay, NativeInput } from '../index'

export type MockCall = { method: keyof NativeInput; args: unknown[] }

export class MockNativeInput implements NativeInput {
  readonly calls: MockCall[] = []
  cursor: CursorPoint = { x: 0, y: 0 }
  displays: NativeDisplay[] = [
    {
      id: 'primary',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      primary: true,
      coordinateSpace: 'pixels'
    }
  ]
  permission = true
  private record(method: keyof NativeInput, ...args: unknown[]): void {
    this.calls.push({ method, args })
  }
  moveTo(x: number, y: number): void {
    this.record('moveTo', x, y)
    this.cursor = { x, y }
  }
  click(button: MouseButton): void {
    this.record('click', button)
  }
  doubleClick(): void {
    this.record('doubleClick')
  }
  mouseDown(button: MouseButton): void {
    this.record('mouseDown', button)
  }
  mouseUp(button: MouseButton): void {
    this.record('mouseUp', button)
  }
  scroll(dx: number, dy: number): void {
    this.record('scroll', dx, dy)
  }
  typeText(text: string): void {
    this.record('typeText', text)
  }
  keyCombo(keys: string[]): void {
    this.record('keyCombo', keys)
  }
  getCursorPos(): CursorPoint {
    this.record('getCursorPos')
    return { ...this.cursor }
  }
  getDisplays(): NativeDisplay[] {
    this.record('getDisplays')
    return structuredClone(this.displays)
  }
  hasInputPermission(): boolean {
    this.record('hasInputPermission')
    return this.permission
  }
  requestInputPermission(): boolean {
    this.record('requestInputPermission')
    return this.permission
  }
}
