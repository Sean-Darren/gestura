import type {
  CursorPoint,
  MouseButton,
  NativeDisplay,
  NativeInput,
  UiElement,
  ForegroundApp
} from '../index'

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
  layout: UiElement[] = []
  foreground: ForegroundApp = { appId: 'mock', windowTitle: 'Scripted layout' }
  async elementAt(x: number, y: number): Promise<UiElement | null> {
    this.record('elementAt', x, y)
    return structuredClone(
      this.layout.find(
        ({ bounds: b, isClickable }) =>
          isClickable && x >= b.x && y >= b.y && x <= b.x + b.width && y <= b.y + b.height
      ) ?? null
    )
  }
  async elementsNear(x: number, y: number, radiusPx: number): Promise<UiElement[]> {
    this.record('elementsNear', x, y, radiusPx)
    const scale = this.displays.find(
      (d) =>
        x >= d.bounds.x &&
        y >= d.bounds.y &&
        x <= d.bounds.x + d.bounds.width &&
        y <= d.bounds.y + d.bounds.height
    )
    const radius = radiusPx / (scale?.coordinateSpace === 'points' ? scale.scaleFactor : 1)
    return structuredClone(
      this.layout
        .filter(
          ({ bounds: b, isClickable }) =>
            isClickable &&
            Math.hypot(
              Math.max(b.x - x, 0, x - b.x - b.width),
              Math.max(b.y - y, 0, y - b.y - b.height)
            ) <= radius
        )
        .slice(0, 50)
    )
  }
  async foregroundApp(): Promise<ForegroundApp> {
    this.record('foregroundApp')
    return { ...this.foreground }
  }
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
