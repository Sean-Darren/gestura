import { loadNativeBinding } from '@gestura/native'
import type { NativeInput, CursorPoint, NativeDisplay, MouseButton } from '@gestura/native'
import { z } from 'zod'
import { performance } from 'node:perf_hooks'
import { isConfirmedAction } from '../action-gate'
import type { ConfirmedAction } from '../action-gate'
import type { PauseController } from '../pause'
import {
  MoveArgsSchema,
  ButtonArgsSchema,
  ScrollArgsSchema,
  TextSchema,
  EmptyArgsSchema,
  ComboArgsSchema,
  PointSchema,
  DisplaysSchema
} from './schemas'

const ConfirmedTextArgsSchema = z.tuple([
  TextSchema,
  z.custom<ConfirmedAction>(isConfirmedAction, 'ActionGate confirmation required')
])
const ConfirmedTextContentSchema = z.object({ text: TextSchema }).strict()

export interface NativeBridge {
  moveTo(x: number, y: number): boolean
  click(button: MouseButton): boolean
  doubleClick(): boolean
  mouseDown(button: MouseButton): boolean
  mouseUp(button: MouseButton): boolean
  scroll(dx: number, dy: number): boolean
  typeText(text: string, confirmation: ConfirmedAction): Promise<boolean>
  keyCombo(keys: string[]): boolean
  getCursorPos(): CursorPoint | undefined
  getDisplays(): NativeDisplay[] | undefined
  hasInputPermission(): boolean | undefined
  requestInputPermission(): boolean | undefined
  readonly cleanupError: Error | undefined
  dispose(): void
}

export function createNativeInput(
  pause: PauseController,
  load: () => NativeInput = loadNativeBinding
): NativeBridge {
  let binding: NativeInput | undefined
  let disposed = false
  let typing = false
  let pauseRevision = 0
  let cleanupError: Error | undefined
  const held = new Set<MouseButton>()
  const usedConfirmations = new WeakSet<ConfirmedAction>()
  const backend = (): NativeInput => {
    binding ??= load()
    return binding
  }
  const active = (): boolean => !disposed && !pause.paused
  const dispatch = (operation: (input: NativeInput) => void): boolean => {
    if (!active()) return false
    operation(backend())
    return true
  }
  const releaseHeld = (): void => {
    for (const button of held) {
      try {
        binding?.mouseUp(button)
        held.delete(button)
      } catch (error) {
        cleanupError = error instanceof Error ? error : new Error(String(error))
      }
    }
  }
  const unsubscribe = pause.subscribe((paused) => {
    if (paused) {
      pauseRevision++
      releaseHeld()
    }
  })

  return {
    moveTo(...args: [number, number]): boolean {
      const [x, y] = MoveArgsSchema.parse(args)
      return dispatch((input) => input.moveTo(x, y))
    },
    click(...args: [MouseButton]): boolean {
      const [button] = ButtonArgsSchema.parse(args)
      return dispatch((input) => input.click(button))
    },
    doubleClick(...args: []): boolean {
      EmptyArgsSchema.parse(args)
      return dispatch((input) => input.doubleClick())
    },
    mouseDown(...args: [MouseButton]): boolean {
      const [button] = ButtonArgsSchema.parse(args)
      return dispatch((input) => {
        input.mouseDown(button)
        held.add(button)
      })
    },
    mouseUp(...args: [MouseButton]): boolean {
      const [button] = ButtonArgsSchema.parse(args)
      return dispatch((input) => {
        input.mouseUp(button)
        held.delete(button)
      })
    },
    scroll(...args: [number, number]): boolean {
      const [dx, dy] = ScrollArgsSchema.parse(args)
      return dispatch((input) => input.scroll(dx, dy))
    },
    async typeText(...args: [string, ConfirmedAction]): Promise<boolean> {
      const [text, confirmation] = ConfirmedTextArgsSchema.parse(args)
      const perm = binding?.hasInputPermission()
      console.error(
        `[native] typeText start: len=${text.length} active=${active()} hasPermission=${perm}`
      )
      if (!active()) {
        console.error('[native] typeText aborted: not active (disposed or paused)')
        return false
      }
      const content = ConfirmedTextContentSchema.parse(confirmation.action.content)
      const age = performance.now() - confirmation.confirmedAt
      if (
        !['type-text', 'dictation'].includes(confirmation.action.kind) ||
        content.text !== text ||
        age < 0 ||
        age >= 60_000 ||
        usedConfirmations.has(confirmation)
      )
        throw new Error('Confirmation does not authorize this text insertion')
      if (typing) throw new Error('A text insertion is already running')
      usedConfirmations.add(confirmation)
      const initialPauseRevision = pauseRevision
      typing = true
      try {
        const characters = Array.from(text)
        console.error(`[native] typeText injecting ${characters.length} chars in chunks of 16`)
        for (let index = 0; index < characters.length; index += 16) {
          if (!active() || pauseRevision !== initialPauseRevision) {
            console.error(
              `[native] typeText aborted mid-way at index ${index}: active=${active()} pauseRev=${pauseRevision} initial=${initialPauseRevision}`
            )
            return false
          }
          const chunk = characters.slice(index, index + 16).join('')
          backend().typeText(chunk)
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
        const complete = active() && pauseRevision === initialPauseRevision
        console.error(`[native] typeText done: complete=${complete}`)
        return complete
      } catch (error) {
        console.error('[native] typeText error:', error)
        throw error
      } finally {
        typing = false
      }
    },
    keyCombo(...args: [string[]]): boolean {
      const [keys] = ComboArgsSchema.parse(args)
      return dispatch((input) => input.keyCombo(keys))
    },
    getCursorPos(...args: []): CursorPoint | undefined {
      EmptyArgsSchema.parse(args)
      return active() ? PointSchema.parse(backend().getCursorPos()) : undefined
    },
    getDisplays(...args: []): NativeDisplay[] | undefined {
      EmptyArgsSchema.parse(args)
      return active() ? DisplaysSchema.parse(backend().getDisplays()) : undefined
    },
    hasInputPermission(...args: []): boolean | undefined {
      EmptyArgsSchema.parse(args)
      return active() ? z.boolean().parse(backend().hasInputPermission()) : undefined
    },
    requestInputPermission(...args: []): boolean | undefined {
      EmptyArgsSchema.parse(args)
      return active() ? z.boolean().parse(backend().requestInputPermission()) : undefined
    },
    get cleanupError(): Error | undefined {
      return cleanupError
    },
    dispose(): void {
      disposed = true
      releaseHeld()
      unsubscribe()
    }
  }
}
