import { loadNativeBinding } from '@gestura/native'
import type { NativeInput } from '@gestura/native'
import {
  ForegroundAppSchema,
  UiElementSchema,
  UiElementsSchema,
  UiNearArgsSchema,
  UiPointArgsSchema
} from '@gestura/core'
import type { ForegroundApp, UiElement } from '@gestura/core'
import { DEFAULT_UI_QUERY_CONFIG, UiQueryConfigSchema } from '@gestura/core/config'
import type { UiQueryConfig } from '@gestura/core/config'
import { performance } from 'node:perf_hooks'
import type { PauseController } from '../pause'
import { EmptyArgsSchema } from './schemas'

type CachedElement = Readonly<Omit<UiElement, 'bounds'>> & {
  readonly bounds: Readonly<UiElement['bounds']>
}
export interface UiSnapshot {
  readonly elements: readonly CachedElement[]
  readonly foreground: Readonly<ForegroundApp>
  readonly x: number
  readonly y: number
  readonly radiusPx: number
  readonly tQuery: number
  readonly tResult: number
}
export interface NativeUiQueries {
  elementAt(x: number, y: number): Promise<UiElement | null | undefined>
  elementsNear(x: number, y: number, radiusPx: number): Promise<UiElement[] | undefined>
  foregroundApp(): Promise<ForegroundApp | undefined>
  getCachedElements(): UiSnapshot | undefined
  dispose(): void
}
export function createNativeUiQueries(
  pause: PauseController,
  load: () => NativeInput = loadNativeBinding,
  config: UiQueryConfig = DEFAULT_UI_QUERY_CONFIG,
  now: () => number = () => performance.now()
): NativeUiQueries {
  const settings = UiQueryConfigSchema.parse(config)
  let binding: NativeInput | undefined
  let disposed = false
  let revision = 0
  let snapshot: UiSnapshot | undefined
  let foreground: ForegroundApp | undefined
  const active = (): boolean => !disposed && !pause.paused
  const backend = (): NativeInput => (binding ??= load())
  const invalidate = (): void => {
    revision++
    snapshot = undefined
    foreground = undefined
  }
  const unsubscribe = pause.subscribe((paused) => {
    if (paused) invalidate()
  })
  const updateForeground = (app: ForegroundApp): void => {
    if (foreground?.appId !== app.appId || foreground.windowTitle !== app.windowTitle)
      snapshot = undefined
    foreground = app
  }
  const deadline = async <T>(operation: () => Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Accessibility query timed out')),
            settings.timeoutMs
          )
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  const query = async (
    x: number,
    y: number,
    radiusPx: number,
    at: boolean
  ): Promise<UiElement[] | undefined> => {
    if (!active()) return undefined
    const version = ++revision
    const tQuery = now()
    try {
      return await deadline(async () => {
        const before = ForegroundAppSchema.parse(await backend().foregroundApp())
        if (!active() || version !== revision) return undefined
        updateForeground(before)
        const elements = at ? backend().elementAt(x, y) : backend().elementsNear(x, y, radiusPx)
        const result = await elements
        if (!active() || version !== revision) return undefined
        const parsed = at
          ? result === null
            ? []
            : [UiElementSchema.parse(result)]
          : UiElementsSchema.parse(result)
        const after = ForegroundAppSchema.parse(await backend().foregroundApp())
        if (!active() || version !== revision) return undefined
        updateForeground(after)
        if (before.appId !== after.appId || before.windowTitle !== after.windowTitle)
          return undefined
        const clickable = parsed.filter((element) => element.isClickable)
        snapshot = Object.freeze({
          elements: Object.freeze(
            clickable.map((element) =>
              Object.freeze({ ...element, bounds: Object.freeze({ ...element.bounds }) })
            )
          ),
          foreground: Object.freeze({ ...after }),
          x,
          y,
          radiusPx,
          tQuery,
          tResult: now()
        })
        return clickable
      })
    } catch (error) {
      if (version === revision) invalidate()
      throw error
    }
  }
  return {
    async elementAt(...args: [number, number]): Promise<UiElement | null | undefined> {
      const [x, y] = UiPointArgsSchema.parse(args)
      const result = await query(x, y, 0, true)
      return result === undefined ? undefined : (result[0] ?? null)
    },
    async elementsNear(...args: [number, number, number]): Promise<UiElement[] | undefined> {
      const [x, y, radius] = UiNearArgsSchema.parse(args)
      return query(x, y, radius, false)
    },
    async foregroundApp(...args: []): Promise<ForegroundApp | undefined> {
      EmptyArgsSchema.parse(args)
      if (!active()) return undefined
      const version = ++revision
      try {
        const app = ForegroundAppSchema.parse(await deadline(() => backend().foregroundApp()))
        if (!active() || version !== revision) return undefined
        updateForeground(app)
        return app
      } catch (error) {
        if (version === revision) invalidate()
        throw error
      }
    },
    getCachedElements(): UiSnapshot | undefined {
      if (!active() || !snapshot) return undefined
      const age = now() - snapshot.tQuery
      if (age < 0 || age >= settings.cacheMaxAgeMs) {
        snapshot = undefined
        return undefined
      }
      return snapshot
    },
    dispose(): void {
      disposed = true
      invalidate()
      unsubscribe()
    }
  }
}
