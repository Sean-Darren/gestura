import { PointerProfileSchema } from '../pointer'
import { z } from 'zod'
import { PaletteConfigSchema, DEFAULT_PALETTE_CONFIG } from '../palette'

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

export const SnapConfigSchema = z
  .object({
    radiusPx: z.number().finite().min(1).max(300).default(60),
    switchMargin: z.number().finite().min(0).max(5).default(0.2),
    switchMs: z.number().finite().min(100).max(1000).default(100),
    cacheMaxAgeMs: z.number().finite().min(50).max(500).default(200),
    refreshMs: z.number().finite().min(50).max(1000).default(100),
    gazeWeight: z.number().finite().min(0).max(1).default(0.15),
    rolePriors: z
      .object({
        button: z.number().finite().min(0).max(1).default(0),
        link: z.number().finite().min(0).max(1).default(0.03),
        'menu-item': z.number().finite().min(0).max(1).default(0),
        tab: z.number().finite().min(0).max(1).default(0.02),
        'list-item': z.number().finite().min(0).max(1).default(0.08),
        'check-box': z.number().finite().min(0).max(1).default(0),
        'edit-field': z.number().finite().min(0).max(1).default(0.06),
        'spreadsheet-cell': z.number().finite().min(0).max(1).default(0.02)
      })
      .strict()
      .default({
        button: 0,
        link: 0.03,
        'menu-item': 0,
        tab: 0.02,
        'list-item': 0.08,
        'check-box': 0,
        'edit-field': 0.06,
        'spreadsheet-cell': 0.02
      })
  })
  .strict()
export type SnapConfig = z.infer<typeof SnapConfigSchema>
export const DEFAULT_SNAP_CONFIG = SnapConfigSchema.parse({})

export const SpeechConfigSchema = z
  .object({
    threshold: z.number().min(0.1).max(0.9).default(0.5),
    minSilenceDuration: z.number().min(0.25).max(2).default(0.5),
    minSpeechDuration: z.number().min(0.1).max(1).default(0.25),
    maxSpeechDuration: z.number().min(2).max(30).default(15),
    numThreads: z.number().int().min(1).max(4).default(2)
  })
  .strict()
export type SpeechConfig = z.infer<typeof SpeechConfigSchema>
export const DEFAULT_SPEECH_CONFIG = SpeechConfigSchema.parse({})

export const IntentConfigSchema = z
  .object({
    fuzzyThreshold: z.number().min(0.7).max(1).default(0.86),
    ambiguityMargin: z.number().min(0.01).max(0.5).default(0.08),
    maxInputLength: z.number().int().min(100).max(16000).default(2000)
  })
  .strict()
export type IntentConfig = z.infer<typeof IntentConfigSchema>
export const DEFAULT_INTENT_CONFIG = IntentConfigSchema.parse({})

export const ExcelConfigSchema = z
  .object({
    // Loopback bridge server is opt-in during the P4.1 spike; P4.2/P4.3 flip this on.
    enabled: z.boolean().default(false),
    port: z.number().int().min(1024).max(65535).default(3510),
    // Q15: sample cell values leave the device only behind a visible, opt-in toggle.
    shareSampleValues: z.boolean().default(false)
  })
  .strict()
export type ExcelConfig = z.infer<typeof ExcelConfigSchema>
export const DEFAULT_EXCEL_CONFIG = ExcelConfigSchema.parse({})

export const GenaiCloudProviderConfigSchema = z
  .object({
    apiKey: z.string().min(1).describe('main-process secret; never persist to renderer settings'),
    host: z.string().min(1).describe('added to network allowlist at runtime'),
    model: z.string().min(1).default('')
  })
  .strict()
export type GenaiCloudProviderConfig = z.infer<typeof GenaiCloudProviderConfigSchema>

export const GenaiLocalProviderConfigSchema = z
  .object({
    host: z.string().default('127.0.0.1:11434'),
    model: z.string().min(1).default(''),
    enabled: z.boolean().default(true)
  })
  .strict()
export type GenaiLocalProviderConfig = z.infer<typeof GenaiLocalProviderConfigSchema>

export const GenaiFormulaConfigSchema = z
  .object({
    timeoutMs: z.number().int().min(1000).max(30000).default(8000),
    maxRetries: z.number().int().min(0).max(3).default(1),
    maxHistory: z.number().int().min(1).max(50).default(20)
  })
  .strict()
export type GenaiFormulaConfig = z.infer<typeof GenaiFormulaConfigSchema>

export const GenaiConfigSchema = z
  .object({
    cloudProvider: GenaiCloudProviderConfigSchema.optional(),
    localProvider: GenaiLocalProviderConfigSchema.default({
      host: '127.0.0.1:11434',
      model: '',
      enabled: true
    }),
    formula: GenaiFormulaConfigSchema.default({ timeoutMs: 8000, maxRetries: 1, maxHistory: 20 })
  })
  .strict()
export type GenaiConfig = z.infer<typeof GenaiConfigSchema>
export const DEFAULT_GENAI_CONFIG = GenaiConfigSchema.parse({})

export const AppConfigSchema = z
  .object({
    network: NetworkConfigSchema.default({ allowlist: [] }),
    logging: LoggingConfigSchema.default({ enabled: false }),
    pointer: PointerConfigSchema.default(DEFAULT_POINTER_CONFIG),
    pointerProfile: PointerProfileSchema.default({ neutral: { yaw: 0, pitch: 0 } }),
    gestures: GestureConfigSchema.default(DEFAULT_GESTURE_CONFIG),
    snapping: SnapConfigSchema.default(DEFAULT_SNAP_CONFIG),
    speech: SpeechConfigSchema.default(DEFAULT_SPEECH_CONFIG),
    intent: IntentConfigSchema.default(DEFAULT_INTENT_CONFIG),
    palette: PaletteConfigSchema.default(DEFAULT_PALETTE_CONFIG),
    excel: ExcelConfigSchema.default(DEFAULT_EXCEL_CONFIG),
    genai: GenaiConfigSchema.default(DEFAULT_GENAI_CONFIG)
  })
  .strict()

export type AppConfig = z.infer<typeof AppConfigSchema>

export const DEFAULT_CONFIG = AppConfigSchema.parse({})

export const BenchOptionsSchema = z
  .object({
    mode: z.enum(['standard', 'realistic']).default('standard'),
    persist: z.boolean().default(false),
    timeoutMs: z.number().finite().min(1000).max(120000).default(30000)
  })
  .strict()
export const DEFAULT_BENCH_OPTIONS = BenchOptionsSchema.parse({})

export const OpenRouterEnvironmentSchema = z.object({
  OPENROUTER_API_KEY: z
    .string()
    .trim()
    .max(512)
    .regex(/^[^\s]*$/)
    .optional(),
  OPENROUTER_MODEL: z.string().trim().min(1).max(200).default('openai/gpt-4.1-mini')
})
