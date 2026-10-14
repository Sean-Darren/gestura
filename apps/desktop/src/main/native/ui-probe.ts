import { app } from 'electron'
import { performance } from 'node:perf_hooks'
import { DEFAULT_UI_QUERY_CONFIG } from '@gestura/core/config'
import { nativeInput, nativeUi, pause } from './runtime'
import { latencyPercentiles } from './latency'
import { runNativeTool } from './tool-runtime'

void runNativeTool(async () => {
  console.log(
    'Local UI probe: names and window titles go to this terminal only. Ctrl+C stops; the pause hotkey suspends queries.'
  )
  const samples: number[] = []
  let stopped = false
  const stop = (): void => {
    stopped = true
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    while (!stopped) {
      const tick = performance.now()
      if (!pause.paused) {
        const point = nativeInput.getCursorPos()
        if (point) {
          try {
            const elements = await nativeUi.elementsNear(
              point.x,
              point.y,
              DEFAULT_UI_QUERY_CONFIG.probeRadiusPx
            )
            const elapsed = performance.now() - tick
            if (elements) {
              samples.push(elapsed)
              if (samples.length > 1000) samples.shift()
              const { p50, p95 } = latencyPercentiles(samples)
              console.log(
                JSON.stringify({
                  cursor: point,
                  radiusPx: DEFAULT_UI_QUERY_CONFIG.probeRadiusPx,
                  elapsedMs: elapsed,
                  p50Ms: p50,
                  p95Ms: p95,
                  samples: samples.length,
                  foreground: nativeUi.getCachedElements()?.foreground,
                  elements
                })
              )
            }
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error))
          }
        }
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(0, 500 - (performance.now() - tick)))
      )
    }
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  app.exit(1)
})
