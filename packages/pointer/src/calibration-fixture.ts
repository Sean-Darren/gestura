import { CalibrationWizard, TEST_TARGETS } from './calibration'
import type { CalibrationObservation } from './calibration'
export function scriptedWizard(
  gaze = false,
  ear?: CalibrationObservation['ear']
): {
  wizard: CalibrationWizard
  observe(patch?: Partial<CalibrationObservation>, count?: number): void
  time(): number
} {
  const wizard = new CalibrationWizard(0, { width: 1280, height: 720, scaleFactor: 1 })
  let t = 0
  const observe = (patch: Partial<CalibrationObservation> = {}, count = 1): void => {
    for (let i = 0; i < count; i++) {
      t += 50
      wizard.observe({
        t,
        ...(ear ? { ear } : {}),
        pose: { yaw: 0, pitch: 0 },
        centered: true,
        lightingGood: true,
        features: undefined,
        left: 0,
        right: 0,
        ...patch
      })
    }
  }
  observe()
  wizard.setGaze(gaze)
  wizard.next()
  observe({}, 61)
  for (const pose of [
    { yaw: -15, pitch: 0 },
    { yaw: 20, pitch: 0 },
    { yaw: 0, pitch: -10 },
    { yaw: 0, pitch: 12 }
  ])
    observe({ pose }, 102)
  return { wizard, observe, time: () => t }
}
export function completeBlinkPhase(session: ReturnType<typeof scriptedWizard>): void {
  for (let i = 0; i < 3; i++) {
    session.observe({ left: 0.9, right: 0.9 }, 11)
    session.observe()
  }
  session.observe({}, 20)
  session.observe({ left: 0.9, right: 0.9 }, 2)
  session.observe()
  session.observe({}, 201)
}
export function completeTargets(session: ReturnType<typeof scriptedWizard>): void {
  for (const target of TEST_TARGETS)
    for (let i = 0; i < 23; i++) {
      session.observe()
      session.wizard.observePoint(target, session.time())
    }
}
