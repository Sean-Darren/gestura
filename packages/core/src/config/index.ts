import { PointerProfileSchema } from '../pointer'
import { z } from 'zod'

const NetworkHostSchema = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(`https://${value}`)
      return url.host === value && url.pathname === '/' && !url.search && !url.hash
    } catch {
      return false
    }
  }, 'Expected a host name, optionally with a port')

export const NetworkConfigSchema = z
  .object({ allowlist: z.array(NetworkHostSchema).default([]) })
  .strict()

export const LoggingConfigSchema = z.object({ enabled: z.boolean().default(false) }).strict()

export const UiQueryConfigSchema = z
  .object({
    cacheMaxAgeMs: z.number().int().min(1).max(1000).default(500),
    timeoutMs: z.number().int().min(1).max(1000).default(250),
    probeRadiusPx: z.number().finite().min(0).max(10_000).default(150)
  })
  .strict()
export type UiQueryConfig = z.infer<typeof UiQueryConfigSchema>
export const DEFAULT_UI_QUERY_CONFIG = UiQueryConfigSchema.parse({})

export const VisionConfigSchema = z
  .object({
    width: z.number().int().positive().default(1280),
    height: z.number().int().positive().default(720),
    frameRate: z.number().int().min(30).max(120).default(60),
    metricsIntervalMs: z.number().int().min(100).max(1000).default(100),
    recordingPromptMs: z.number().int().min(1000).max(30_000).default(5000)
  })
  .strict()
export const DEFAULT_VISION_CONFIG = VisionConfigSchema.parse({})

export const PointerConfigSchema = z
  .object({
    deadZoneDeg: z.number().finite().min(0).max(10).default(0.6),
    yawRangeDeg: z.number().finite().min(5).max(60).default(25),
    pitchRangeDeg: z.number().finite().min(5).max(60).default(20),
    centerGain: z.number().finite().min(0.05).max(1).default(0.35),
    minCutoff: z.number().finite().positive().default(1),
    beta: z.number().finite().nonnegative().default(0.01),
    dCutoff: z.number().finite().positive().default(1),
    gazeEnabled: z.boolean().default(false),
    gazeStableMs: z.number().finite().min(1).default(300),
    gazeJumpDistancePx: z.number().finite().positive().default(300),
    gazeStabilityRadiusPx: z.number().finite().positive().default(40),
    gazeHeadCorrectionPerDeg: z.number().finite().nonnegative().default(0.005),
    jitterThresholdPx: z.number().finite().positive().default(3),
    staleFrameMs: z.number().finite().positive().default(250)
  })
  .strict()
  .refine((value) => value.deadZoneDeg < Math.min(value.yawRangeDeg, value.pitchRangeDeg), {
    message: 'Dead zone must be smaller than both pose ranges'
  })
export type PointerConfig = z.infer<typeof PointerConfigSchema>
export const DEFAULT_POINTER_CONFIG = PointerConfigSchema.parse({})

export const CalibrationConfigSchema = z
  .object({
    neutralMs: z.literal(3000).default(3000),
    rangeMs: z.number().int().min(2000).max(10000).default(5000),
    gazeDotMs: z.literal(1500).default(1500),
    naturalBlinkMs: z.literal(10000).default(10000),
    longBlinkMs: z.number().int().min(400).max(2000).default(400),
    minSamples: z.number().int().min(5).max(60).default(15),
    ridgeLambda: z.number().finite().positive().default(0.001),
    dwellMs: z.number().int().min(500).max(2000).default(1000),
    targetSizePx: z.number().int().min(64).max(160).default(96),
    darkLuminance: z.number().min(0).max(0.4).default(0.12),
    brightLuminance: z.number().min(0.6).max(1).default(0.92)
  })
  .strict()
export const DEFAULT_CALIBRATION_CONFIG = CalibrationConfigSchema.parse({})

export const GestureConfigSchema = z
  .object({
    mode: z.enum(['off', 'blink', 'dwell']).default('off'),
    maxLongBlinkMs: z.number().finite().min(400).max(5000).default(1500),
    winkMinMs: z.number().finite().min(250).max(2000).default(250),
    onsetSyncMs: z.number().finite().min(0).max(200).default(80),
    dwellRadiusPx: z.number().finite().min(1).max(100).default(24),
    dwellMs: z.number().finite().min(500).max(5000).default(1000),
    maxSpeedPxS: z.number().finite().positive().default(500),
    cooldownMs: z.number().finite().min(200).max(3000).default(500),
    jawHoldMs: z.number().finite().min(800).max(3000).default(800),
    jawOpenScore: z.number().min(0.3).max(1).default(0.6),
    jawCloseScore: z.number().min(0).max(0.5).default(0.3),
    staleMs: z.number().finite().min(50).max(1000).default(250),
    earClosedRatio: z.number().min(0.1).max(0.7).default(0.45),
    earOpenRatio: z.number().min(0.4).max(1).default(0.75),
    pauseDwellMs: z.number().finite().min(500).max(3000).default(1200),
    pauseTargetSize: z.number().finite().min(48).max(160).default(72),
    pauseInferenceFps: z.number().int().min(5).max(15).default(5)
  })
  .strict()
  .refine(
    (v) => v.jawOpenScore > v.jawCloseScore && v.earOpenRatio > v.earClosedRatio,
    'Invalid gesture hysteresis'
  )
export type GestureConfig = z.infer<typeof GestureConfigSchema>
export const DEFAULT_GESTURE_CONFIG = GestureConfigSchema.parse({})

export const AppConfigSchema = z
  .object({
    network: NetworkConfigSchema.default({ allowlist: [] }),
    logging: LoggingConfigSchema.default({ enabled: false }),
    pointer: PointerConfigSchema.default(DEFAULT_POINTER_CONFIG),
    pointerProfile: PointerProfileSchema.default({ neutral: { yaw: 0, pitch: 0 } }),
    gestures: GestureConfigSchema.default(DEFAULT_GESTURE_CONFIG)
  })
  .strict()

export type AppConfig = z.infer<typeof AppConfigSchema>

export const DEFAULT_CONFIG = AppConfigSchema.parse({})
