import { app } from 'electron'
import { nativeInput } from './runtime'
import { benchmarkMoves } from './latency'
import { runNativeTool } from './tool-runtime'

void runNativeTool(async () => {
  const result = await benchmarkMoves(nativeInput)
  console.log(
    `moveTo ${result.count} calls: p50=${result.p50.toFixed(2)} µs, p95=${result.p95.toFixed(2)} µs (wrapper + addon, stationary cursor)`
  )
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  app.exit(1)
})
