import { randomUUID } from 'node:crypto'
import { FocusedTextSchema, FieldWriteSchema } from '@gestura/core'
import type { FocusedText } from '@gestura/core'
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
  captureFocusedText(): Promise<FocusedText | undefined>
  checkFocusedText(token: string, text?: string, after?: boolean): Promise<boolean>
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
    async captureFocusedText(...args: []): Promise<FocusedText | undefined> {
      EmptyArgsSchema.parse(args)
      if (!active()) return undefined
      const version = pauseRevision
      const value = await backend().captureFocusedText(randomUUID())
      if (!active() || version !== pauseRevision || !value) return undefined
      return FocusedTextSchema.parse(value)
    },
    async checkFocusedText(token: string, text = '', after = false): Promise<boolean> {
      const args = z.tuple([z.string().uuid(), TextSchema, z.boolean()]).parse([token, text, after])
      if (!active()) return false
      const version = pauseRevision
      const result = z.boolean().parse(await backend().checkTextTarget(...args))
      return result && active() && version === pauseRevision
    },
    async typeText(...args: [string, ConfirmedAction]): Promise<boolean> {
      const [text, confirmation] = ConfirmedTextArgsSchema.parse(args)
      if (!active()) return false
      const fieldAction = ['plain-text', 'plain-text-restore'].includes(confirmation.action.kind)
      const field = fieldAction ? FieldWriteSchema.parse(confirmation.action.content) : undefined
      const content = field ?? ConfirmedTextContentSchema.parse(confirmation.action.content)
      const age = performance.now() - confirmation.confirmedAt
      if (
        (!fieldAction && !['type-text', 'dictation'].includes(confirmation.action.kind)) ||
        content.text !== text ||
        age < 0 ||
        age >= 60000 ||
        usedConfirmations.has(confirmation)
      )
        throw Error('Confirmation does not authorize this text insertion')
      if (typing) throw Error('A text insertion is already running')
      usedConfirmations.add(confirmation)
      const initialPauseRevision = pauseRevision
      const current = (): boolean => active() && pauseRevision === initialPauseRevision
      typing = true
      try {
        if (field) {
          if (confirmation.action.kind === 'plain-text-restore') {
            if (
              !field.insertedText ||
              !z
                .boolean()
                .parse(await backend().selectInsertedText(field.fieldToken, field.insertedText)) ||
              !current()
            )
              return false
          } else if (!text || field.insertedText !== undefined) return false
          if (
            !z.boolean().parse(await backend().checkTextTarget(field.fieldToken, '', false)) ||
            !current()
          )
            return false
        }
        const characters = Array.from(text)
        if (field && !text) {
          if (confirmation.action.kind !== 'plain-text-restore' || !current()) return false
          backend().keyCombo(['backspace'])
          await new Promise<void>((resolve) => setImmediate(resolve))
          return (
            current() &&
            z.boolean().parse(await backend().checkTextTarget(field.fieldToken, '', true)) &&
            current()
          )
        }
        for (let index = 0; index < characters.length; index += 16) {
          if (!current()) return false
          backend().typeText(characters.slice(index, index + 16).join(''))
          await new Promise<void>((resolve) => setImmediate(resolve))
          if (
            field &&
            (!current() ||
              !z
                .boolean()
                .parse(
                  await backend().checkTextTarget(
                    field.fieldToken,
                    characters.slice(0, index + 16).join(''),
                    true
                  )
                ) ||
              !current())
          )
            return false
        }
        return current()
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
