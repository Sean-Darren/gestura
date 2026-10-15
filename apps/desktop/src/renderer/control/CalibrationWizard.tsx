import { SnapSettings } from './SnapSettings'
import { PointingBench } from './PointingBench'
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { CalibrationState } from '@gestura/core'
import { DebugPanel, DwellButton } from './DebugPanel'
const initial: CalibrationState = {
  firstRun: false,
  active: false,
  stage: 'framing',
  paused: false,
  elapsedMs: 0,
  remainingMs: 0,
  index: 0,
  message: 'Checking local calibration profile',
  faceCentered: false,
  faceDetected: false,
  lighting: 'unknown',
  gazeEnabled: false,
  loggingEnabled: false,
  cursor: null,
  target: null,
  dwellProgress: 0
}
export function CalibrationControl(): JSX.Element {
  const [state, setState] = useState(initial)
  const [benchOpen, setBenchOpen] = useState(false)
  const surface = useRef<HTMLElement | null>(null)
  const dwell = useRef<{ key: string; since: number } | undefined>(undefined)
  const consumed = useRef(false)
  const dwellMeter = useRef<HTMLProgressElement | null>(null)
  useEffect(() => {
    const off = window.gestura.on('calibration:state', setState)
    window.gestura.send('app:ready', {})
    return off
  }, [])
  useEffect(() => {
    const updateProgress = (value: number): void => {
      if (dwellMeter.current) dwellMeter.current.value = value
    }
    if (!state.active || state.paused || !state.cursor) {
      dwell.current = undefined
      consumed.current = false
      updateProgress(0)
      return
    }
    const x = state.cursor.x * window.innerWidth,
      y = state.cursor.y * window.innerHeight
    const buttons = [
      ...(surface.current?.querySelectorAll<HTMLButtonElement>('button[data-dwell]') ?? [])
    ]
    const button = buttons.find((b) => {
      const r = b.getBoundingClientRect()
      return !b.disabled && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    })
    if (!button) {
      dwell.current = undefined
      consumed.current = false
      updateProgress(0)
      return
    }
    const key = button.dataset.dwell!
    if (consumed.current) return
    const now = performance.now()
    if (dwell.current?.key !== key) {
      dwell.current = { key, since: now }
      updateProgress(0)
      return
    }
    const value = Math.min(1, (now - dwell.current.since) / 1000)
    updateProgress(value)
    if (value === 1) {
      consumed.current = true
      dwell.current = undefined
      button.click()
    }
  }, [state])
  const command = (operation: 'next' | 'retry' | 'cancel' | 'save' | 'start' | 'clear-log'): void =>
    window.gestura.send('calibration:control', { operation })
  if (!state.active)
    return (
      <>
        <PointingBench onOpenChange={setBenchOpen} />
        <div hidden={benchOpen} inert={benchOpen}>
          <section className="calibration-launch controls" aria-label="Calibration settings">
            <DwellButton onClick={() => command('start')}>
              {state.firstRun ? 'Start first-run calibration' : 'Recalibrate'}
            </DwellButton>
            <DwellButton
              onClick={() =>
                window.gestura.send('calibration:control', {
                  operation: 'logging',
                  enabled: !state.loggingEnabled
                })
              }
            >
              {state.loggingEnabled ? 'Disable local duration log' : 'Enable local duration log'}
            </DwellButton>
            <DwellButton
              disabled={state.firstRun}
              onClick={() =>
                window.gestura.send('calibration:control', {
                  operation: 'gaze',
                  enabled: !state.gazeEnabled
                })
              }
            >
              {state.gazeEnabled ? 'Disable calibrated gaze' : 'Enable calibrated gaze'}
            </DwellButton>
            <DwellButton onClick={() => command('clear-log')}>Clear local duration log</DwellButton>
            <p role="status">{state.message}</p>
          </section>
          <SnapSettings />
          <DebugPanel gazeEnabled={state.gazeEnabled} />
        </div>
      </>
    )
  const heading =
    state.stage === 'framing'
      ? 'Camera framing'
      : state.stage === 'neutral'
        ? 'Neutral pose'
        : state.stage === 'range'
          ? 'Comfortable motion range'
          : state.stage === 'gaze'
            ? 'Gaze calibration'
            : state.stage === 'deliberate-blinks'
              ? 'Three long blinks'
              : state.stage === 'natural-blinks'
                ? 'Natural blinking'
                : state.stage === 'quick-test'
                  ? 'Select five targets'
                  : 'Review calibration'
  return (
    <main
      className={`calibration-wizard ${state.target ? 'calibration-target-mode' : ''}`}
      ref={surface}
    >
      <header>
        <h1>{heading}</h1>
        <p className="calibration-timer" aria-live="off">
          Elapsed {Math.floor(state.elapsedMs / 1000)} s
          {state.remainingMs > 0
            ? ` · capture ${Math.ceil(state.remainingMs / 1000)} s remaining`
            : ''}
          {state.paused ? ' · paused' : ''}
        </p>
      </header>
      <section className="calibration-instructions">
        <p role="status">
          {state.target
            ? !state.faceDetected
              ? 'Face not detected. Reframe yourself to continue.'
              : state.lighting !== 'good'
                ? 'Check lighting before continuing this capture.'
                : state.stage === 'gaze'
                  ? `Look at dot ${state.index + 1} of 9.`
                  : `Dwell on target ${state.index + 1} of 5 for one second.`
            : state.message}
        </p>
        {state.stage === 'framing' && (
          <>
            <div
              className="framing-guide"
              aria-label={state.faceCentered ? 'Face centered' : 'Face needs centering'}
            >
              <span>
                {state.faceDetected
                  ? state.faceCentered
                    ? 'Face centered'
                    : 'Move your face toward the camera center'
                  : 'No face detected'}
              </span>
            </div>
            <p>
              {state.lighting === 'good'
                ? 'Lighting is suitable'
                : state.lighting === 'dark'
                  ? 'Too dark: add light in front of your face'
                  : state.lighting === 'bright'
                    ? 'Too bright: reduce glare or backlighting'
                    : 'Waiting for camera lighting measurement'}
            </p>
            <p>
              Camera pixels stay in the vision process. No preview is sent here. OS camera
              permission may need manual approval.
            </p>
          </>
        )}
        {state.stage === 'range' && (
          <p className="calibration-direction">
            Turn toward {['left', 'right', 'top', 'bottom'][state.index]}. Hold a comfortable
            position.
          </p>
        )}
        {state.stage === 'deliberate-blinks' && (
          <p>
            {state.index} of 3 long blinks captured. Hold each for at least 0.4 seconds and reopen.
          </p>
        )}
        {state.stage === 'review' && (
          <p>
            Save neutral pose, motion range, {state.gazeEnabled ? 'gaze mapping, ' : ''}blink
            thresholds and total duration on this device.
          </p>
        )}
      </section>
      <div className="calibration-actions controls">
        {state.stage === 'framing' && (
          <>
            <DwellButton
              data-dwell="gaze"
              disabled={state.paused}
              onClick={() =>
                window.gestura.send('calibration:control', {
                  operation: 'gaze',
                  enabled: !state.gazeEnabled
                })
              }
            >
              {state.gazeEnabled ? 'Gaze on — switch off' : 'Gaze off — switch on'}
            </DwellButton>
            <DwellButton
              data-dwell="next"
              disabled={state.paused || !state.faceCentered || state.lighting !== 'good'}
              onClick={() => command('next')}
            >
              Continue
            </DwellButton>
          </>
        )}
        {state.stage === 'review' && (
          <DwellButton data-dwell="save" disabled={state.paused} onClick={() => command('save')}>
            Save and start head control
          </DwellButton>
        )}
        <DwellButton data-dwell="retry" disabled={state.paused} onClick={() => command('retry')}>
          {state.stage === 'framing' ? 'Retry camera' : 'Retry this step'}
        </DwellButton>
        <DwellButton
          data-dwell="logging"
          disabled={state.paused}
          onClick={() =>
            window.gestura.send('calibration:control', {
              operation: 'logging',
              enabled: !state.loggingEnabled
            })
          }
        >
          {state.loggingEnabled
            ? 'Duration logging on — switch off'
            : 'Duration logging off — switch on'}
        </DwellButton>
        <DwellButton data-dwell="cancel" onClick={() => command('cancel')}>
          Cancel setup
        </DwellButton>
      </div>
      <p className="calibration-help">
        {state.target
          ? 'Dwell 1 s · Pause Ctrl+Option+P / Ctrl+Alt+P'
          : 'Head movement controls the ring. Dwell for one second to select a control; keyboard and mouse also work. Pause anytime: Ctrl+Option+P / Ctrl+Alt+P.'}
      </p>
      {state.target && (
        <div
          className={`calibration-target ${state.stage === 'gaze' ? 'gaze-dot' : ''}`}
          style={{ left: `${state.target.x * 100}%`, top: `${state.target.y * 100}%` }}
          role="img"
          aria-label={
            state.stage === 'gaze'
              ? `Gaze dot ${state.index + 1}`
              : `Test target ${state.index + 1}`
          }
        >
          {state.stage === 'quick-test' && (
            <>
              <span>{state.index + 1}</span>
              <progress max={1} value={state.dwellProgress} aria-label="Target dwell progress" />
            </>
          )}
        </div>
      )}
      {state.cursor && !state.paused && (
        <div
          className="calibration-cursor"
          style={{ left: `${state.cursor.x * 100}%`, top: `${state.cursor.y * 100}%` }}
          aria-hidden="true"
        >
          <progress ref={dwellMeter} max={1} defaultValue={0} />
        </div>
      )}
    </main>
  )
}
