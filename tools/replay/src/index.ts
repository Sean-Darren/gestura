import { FaceFrameSchema, SerializedFaceFrameSchema, serializeFaceFrame } from '@gestura/core'
import type { FaceFrame } from '@gestura/core'
import { z } from 'zod'

export interface FrameSource {
  subscribe(listener: (frame: FaceFrame) => void): () => void
  start(): void | Promise<void>
  stop(): void
  setPaused(paused: boolean): void
}
export class FrameBus {
  private readonly listeners = new Set<(frame: FaceFrame) => void>()
  subscribe(listener: (frame: FaceFrame) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  emit(frame: FaceFrame): void {
    for (const listener of this.listeners) listener(frame)
  }
}
export const SCRIPT_PROMPTS = [
  'Look at the top-left of your screen',
  'Look at the top-right of your screen',
  'Look at the bottom-left of your screen',
  'Look at the bottom-right of your screen',
  'Long blink now',
  'Wink right',
  'Read this text aloud: Hello, Gestura. 你好。',
  'Open mouth and hold'
] as const
export const SessionLabelsSchema = z
  .object({
    version: z.literal(1),
    sessionStart: z.number().finite().nonnegative(),
    sessionEnd: z.number().finite().nonnegative(),
    prompts: z
      .array(
        z
          .object({
            prompt: z.string().max(500),
            start: z.number().finite().nonnegative(),
            end: z.number().finite().nonnegative()
          })
          .strict()
      )
      .max(100)
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.sessionEnd < value.sessionStart ||
      value.prompts.some(
        (p, i) =>
          p.end < p.start ||
          p.start < value.sessionStart ||
          p.end > value.sessionEnd ||
          (i > 0 && p.start < (value.prompts[i - 1]?.end ?? 0))
      )
    )
      context.addIssue({ code: 'custom', message: 'Invalid prompt timing' })
  })
export type SessionLabels = z.infer<typeof SessionLabelsSchema>
export interface RecordedSession {
  jsonl: string
  labels: SessionLabels
}
export class ScriptedRecorder {
  private readonly lines: string[] = []
  private readonly labels: SessionLabels['prompts'] = []
  private index = 0
  private promptStart: number
  private promptLabelStart: number
  private pausedAt: number | undefined
  private finished = false
  constructor(
    private readonly startTime: number,
    private readonly promptMs: number,
    private readonly prompts: readonly string[] = SCRIPT_PROMPTS
  ) {
    if (
      !Number.isFinite(startTime) ||
      startTime < 0 ||
      !Number.isFinite(promptMs) ||
      promptMs <= 0 ||
      prompts.length === 0
    )
      throw new Error('Invalid recording script')
    this.promptStart = startTime
    this.promptLabelStart = startTime
  }
  setPaused(paused: boolean, now: number): void {
    if (this.finished) return
    if (paused && this.pausedAt === undefined) {
      this.tick(now)
      this.pausedAt = now
    }
    if (!paused && this.pausedAt !== undefined) {
      this.promptStart += now - this.pausedAt
      this.pausedAt = undefined
    }
  }
  tick(now: number): {
    prompt: string
    index: number
    total: number
    remainingMs: number
    done: boolean
  } {
    const time = this.pausedAt ?? now
    while (!this.finished && time >= this.promptStart + this.promptMs) {
      this.labels.push({
        prompt: this.prompts[this.index] ?? '',
        start: this.promptLabelStart,
        end: this.promptStart + this.promptMs
      })
      this.promptStart += this.promptMs
      this.promptLabelStart = this.promptStart
      this.index++
      this.finished = this.index >= this.prompts.length
    }
    return {
      prompt: this.prompts[this.index] ?? '',
      index: this.index,
      total: this.prompts.length,
      remainingMs: this.finished ? 0 : Math.max(0, this.promptMs - (time - this.promptStart)),
      done: this.finished
    }
  }
  append(frame: FaceFrame): void {
    if (this.finished || this.pausedAt !== undefined) return
    const parsed = FaceFrameSchema.parse(frame)
    if (parsed.tCapture < this.startTime) throw new Error('Frame predates the recording')
    if (this.lines.length >= 20_000) throw new Error('Recording frame limit reached')
    this.lines.push(JSON.stringify(serializeFaceFrame(parsed)))
  }
  finish(now: number): RecordedSession {
    this.tick(now)
    if (!this.finished) {
      this.labels.push({
        prompt: this.prompts[this.index] ?? '',
        start: this.promptLabelStart,
        end: Math.max(this.promptStart, this.pausedAt ?? now)
      })
      this.finished = true
    }
    return {
      jsonl: this.lines.join('\n') + (this.lines.length ? '\n' : ''),
      labels: SessionLabelsSchema.parse({
        version: 1,
        sessionStart: this.startTime,
        sessionEnd: now,
        prompts: this.labels
      })
    }
  }
}
export function parseFixture(jsonl: string): FaceFrame[] {
  if (jsonl.length > 200_000_000) throw new Error('Fixture exceeds 200 MB')
  const lines = jsonl.trim().split('\n').filter(Boolean)
  if (lines.length > 20_000) throw new Error('Fixture exceeds 20,000 frames')
  const frames = lines.map((line) => SerializedFaceFrameSchema.parse(JSON.parse(line)))
  for (let i = 1; i < frames.length; i++)
    if ((frames[i]?.tCapture ?? 0) < (frames[i - 1]?.tCapture ?? 0))
      throw new Error('Fixture timestamps must be ordered')
  return frames
}
export interface ReplayClock {
  now(): number
  schedule(callback: () => void, delay: number): () => void
}
export class FixturePlayer implements FrameSource {
  private readonly bus = new FrameBus()
  private index = 0
  private offset = 0
  private startedAt = 0
  private running = false
  private paused = false
  private cancelTimer: (() => void) | undefined
  constructor(
    private readonly frames: readonly FaceFrame[],
    private readonly clock: ReplayClock,
    private readonly onEnd: () => void = () => {}
  ) {
    frames.forEach((frame) => FaceFrameSchema.parse(frame))
    if (frames.some((frame, i) => i > 0 && frame.tCapture < (frames[i - 1]?.tCapture ?? 0)))
      throw new Error('Fixture timestamps must be ordered')
  }
  subscribe(listener: (frame: FaceFrame) => void): () => void {
    return this.bus.subscribe(listener)
  }
  start(): void {
    this.stop()
    this.running = true
    this.index = 0
    this.offset = 0
    this.startedAt = this.clock.now()
    if (!this.paused) this.schedule()
  }
  stop(): void {
    this.running = false
    this.cancelTimer?.()
    this.cancelTimer = undefined
  }
  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    if (!this.running) return
    if (paused) {
      this.offset += this.clock.now() - this.startedAt
      this.cancelTimer?.()
      this.cancelTimer = undefined
    } else {
      this.startedAt = this.clock.now()
      this.schedule()
    }
  }
  private schedule(): void {
    if (!this.running || this.paused) return
    const frame = this.frames[this.index]
    if (!frame) {
      this.stop()
      this.onEnd()
      return
    }
    const delay =
      frame.tCapture -
      (this.frames[0]?.tCapture ?? 0) -
      this.offset -
      (this.clock.now() - this.startedAt)
    this.cancelTimer = this.clock.schedule(
      () => {
        if (!this.running || this.paused) return
        this.index++
        this.bus.emit(frame)
        this.schedule()
      },
      Math.max(0, delay)
    )
  }
}
