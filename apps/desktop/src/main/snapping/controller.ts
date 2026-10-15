import { SnapSelector, snapKey, targetScore, physicalBounds } from '@gestura/pointer'
import type { Point, SnapCandidate } from '@gestura/pointer'
import { SnapControlSchema, SnapPreferencesSchema } from '@gestura/core'
import type {
  PointerDisplay,
  SnapBounds,
  SnapSettings,
  SnapPreferences,
  PoorCoverage
} from '@gestura/core'
import { DEFAULT_SNAP_CONFIG } from '@gestura/core/config'
import type { SnapConfig } from '@gestura/core/config'
import type { NativeUiQueries, UiSnapshot } from '../native/ui-elements'
import type { PauseController } from '../pause'
export class SnapController {
  private readonly config: SnapConfig
  private readonly selector: SnapSelector
  private readonly unsubscribe: () => void
  private preferences: SnapPreferences
  private known: string[] = []
  private windowTitle: string | undefined
  private foreground: string | undefined
  private point: Point | undefined
  private display: PointerDisplay | undefined
  private pointTime = -Infinity
  private accepted: UiSnapshot | undefined
  private elements: SnapCandidate[] = []
  private selected: SnapCandidate | undefined
  private generation = 0
  private disposed = false
  private pending = false
  private nextPoll = 0
  private status =
    'Snapping starts off. Bring an app forward while head control is active, then enable it here.'
  private preferenceError = ''
  private writes: Promise<void> = Promise.resolve()
  constructor(
    private readonly options: {
      ui: NativeUiQueries
      pause: PauseController
      platform: 'darwin' | 'win32'
      now(): number
      cacheNow(): number
      publish(state: SnapSettings): void
      highlight(bounds: SnapBounds | null): void
      save(value: SnapPreferences): Promise<void>
      preferences: SnapPreferences
      poor: PoorCoverage
      config?: SnapConfig
      reserved?(point: Point): boolean
    }
  ) {
    this.preferences = SnapPreferencesSchema.parse({
      version: 1,
      apps: Object.fromEntries(
        Object.entries(options.preferences.apps).map(([id, enabled]) => [this.id(id), enabled])
      )
    })
    this.config = options.config ?? DEFAULT_SNAP_CONFIG
    this.selector = new SnapSelector(this.config)
    this.unsubscribe = options.pause.subscribe((paused) => {
      if (paused) this.reset()
      this.publish()
    })
  }
  private id(appId: string): string {
    return this.options.platform === 'win32' ? appId.toLowerCase() : appId
  }
  private poor(appId: string): string | undefined {
    return this.options.poor.find(
      (p) => p.os === this.options.platform && this.id(p.appId) === appId
    )?.reason
  }
  private enabled(appId: string): boolean {
    return (
      !this.poor(appId) &&
      Object.hasOwn(this.preferences.apps, appId) &&
      this.preferences.apps[appId] === true
    )
  }
  get state(): SnapSettings {
    const ids = [
      ...new Set([
        ...(this.foreground ? [this.foreground] : []),
        ...this.known,
        ...Object.keys(this.preferences.apps)
      ])
    ].slice(0, 128)
    return {
      foreground: this.foreground ?? null,
      apps: ids.map((appId) => ({
        appId,
        enabled: this.enabled(appId),
        blocked: !!this.poor(appId),
        reason: this.poor(appId) ?? ''
      })),
      message: this.preferenceError || this.status
    }
  }
  private publish(): void {
    this.options.publish(this.state)
  }
  setPreference(value: { appId: string; enabled: boolean }): Promise<void> {
    const command = SnapControlSchema.parse(value)
    const work = this.writes.then(async () => {
      const appId = this.id(command.appId)
      if (command.enabled && this.poor(appId)) {
        this.status = 'This app is off because its documented accessibility coverage is poor'
        this.publish()
        return
      }
      try {
        const preferences = SnapPreferencesSchema.parse({
          version: 1,
          apps: { ...this.preferences.apps, [appId]: command.enabled }
        })
        await this.options.save(preferences)
        this.preferenceError = ''
        this.preferences = preferences
        this.invalidate()
        this.status = 'Per-app snapping preference saved locally'
      } catch {
        this.preferenceError = 'Could not save snapping preference; check local storage and retry'
      }
      this.publish()
    })
    this.writes = work.catch(() => {})
    return work
  }
  private invalidate(): void {
    this.generation++
    this.accepted = undefined
    this.elements = []
    this.selected = undefined
    this.selector.reset()
    this.options.highlight(null)
  }
  reset(): void {
    this.invalidate()
    this.point = undefined
    this.pointTime = -Infinity
  }
  update(
    point: Point,
    display: PointerDisplay,
    gaze: Readonly<Point> | undefined,
    frozen = false
  ): void {
    if (this.disposed || this.options.pause.paused) return
    this.point = { ...point }
    this.display = display
    this.pointTime = this.options.now()
    const candidates = this.validElements()
    if (frozen) {
      const previous = this.selected
      this.selected = previous
        ? candidates?.find(
            (t) =>
              snapKey(t) === snapKey(previous) &&
              t.name === previous.name &&
              Number.isFinite(targetScore(point, gaze, t, this.config))
          )
        : undefined
    } else
      this.selected = candidates
        ? this.selector.update(point, gaze, candidates, this.options.now())
        : undefined
    this.options.highlight(this.selected ? { ...this.selected.bounds } : null)
  }
  private validElements(): readonly SnapCandidate[] | undefined {
    const snapshot = this.options.ui.getCachedElements(),
      age = this.accepted ? this.options.cacheNow() - this.accepted.tQuery : Infinity
    if (
      !snapshot ||
      snapshot !== this.accepted ||
      age < 0 ||
      age >= this.config.cacheMaxAgeMs ||
      !this.foreground ||
      this.id(snapshot.foreground.appId) !== this.foreground ||
      !this.enabled(this.foreground)
    ) {
      this.selector.reset()
      return undefined
    }
    const scale = this.display?.coordinateSpace === 'points' ? this.display.scaleFactor : 1
    if (
      !this.point ||
      Math.hypot(this.point.x - snapshot.x * scale, this.point.y - snapshot.y * scale) >
        this.config.radiusPx
    ) {
      this.selector.reset()
      return undefined
    }
    return this.elements
  }
  click(point: Point): Point {
    if (this.options.pause.paused || !this.point || this.options.now() - this.pointTime > 250)
      return point
    const selected = this.selected
    const current = selected
      ? this.validElements()?.find(
          (t) => snapKey(t) === snapKey(selected) && t.name === selected.name
        )
      : undefined
    if (!current || !Number.isFinite(targetScore(point, undefined, current, this.config)))
      return point
    return {
      x: current.bounds.x + current.bounds.width / 2,
      y: current.bounds.y + current.bounds.height / 2
    }
  }
  tick(): void {
    if (this.disposed || this.options.pause.paused) return
    if (!this.validElements()) {
      this.selected = undefined
      this.options.highlight(null)
    }
    const now = this.options.now()
    if (this.pending || now < this.nextPoll) return
    // Observe apps only during fresh, live head control. No passive application history is stored.
    if (!this.point || !this.display || now - this.pointTime > 250) return
    this.pending = true
    this.nextPoll = now + this.config.refreshMs
    const generation = this.generation,
      point = { ...this.point },
      display = this.display
    void (async () => {
      try {
        const app = await this.options.ui.foregroundApp()
        if (!app || this.disposed || this.options.pause.paused || generation !== this.generation)
          return
        const id = this.id(app.appId)
        if (!id || id.length > 512) return
        if (this.foreground !== id || this.windowTitle !== app.windowTitle) {
          this.accepted = undefined
          this.elements = []
          this.selected = undefined
          this.selector.reset()
          this.options.highlight(null)
        }
        this.windowTitle = app.windowTitle
        this.foreground = id
        this.known = [id, ...this.known.filter((v) => v !== id)].slice(0, 20)
        this.status = this.poor(id)
          ? 'Snapping is off for this app: documented poor coverage'
          : this.enabled(id)
            ? 'Snapping enabled; cursor stays free, only gesture clicks snap'
            : 'Snapping is off for this app'
        this.publish()
        if (!this.enabled(id)) {
          this.accepted = undefined
          this.options.highlight(null)
          return
        }
        const scale = display.coordinateSpace === 'points' ? display.scaleFactor : 1
        await this.options.ui.elementsNear(point.x / scale, point.y / scale, this.config.radiusPx)
        if (this.disposed || this.options.pause.paused || generation !== this.generation) return
        const snapshot = this.options.ui.getCachedElements()
        if (!snapshot || this.id(snapshot.foreground.appId) !== id) return
        const b = physicalBounds(display)
        this.elements = snapshot.elements
          .map((t) => ({
            ...t,
            bounds: {
              x: t.bounds.x * scale,
              y: t.bounds.y * scale,
              width: t.bounds.width * scale,
              height: t.bounds.height * scale
            }
          }))
          .filter((t) => {
            const x = t.bounds.x + t.bounds.width / 2,
              y = t.bounds.y + t.bounds.height / 2
            return (
              x >= b.x &&
              y >= b.y &&
              x < b.x + b.width &&
              y < b.y + b.height &&
              !this.options.reserved?.({ x, y })
            )
          })
        this.accepted = snapshot
      } catch {
        if (generation === this.generation) {
          this.invalidate()
          this.foreground = undefined
          this.status =
            'Accessibility queries unavailable; snapping is off until fresh results arrive'
          this.publish()
        }
      } finally {
        this.pending = false
      }
    })()
  }
  async settle(): Promise<void> {
    await this.writes
  }
  dispose(): void {
    this.disposed = true
    this.reset()
    this.unsubscribe()
  }
}
