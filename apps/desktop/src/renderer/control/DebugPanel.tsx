import { useEffect, useRef, useState } from 'react'
import type { JSX, ButtonHTMLAttributes } from 'react'
import type { IpcPayloadFor, VisionMetrics, VisionStatus, PointerMetrics } from '@gestura/core'

export function DwellButton({
  onClick,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = (): void => {
    clearTimeout(timer.current)
    timer.current = undefined
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      {...props}
      disabled={disabled}
      onPointerEnter={(event) => {
        cancel()
        if (!disabled) {
          const target = event.currentTarget
          timer.current = setTimeout(() => {
            target.click()
          }, 1000)
        }
      }}
      onPointerLeave={() => {
        cancel()
      }}
      onPointerDown={cancel}
      onClick={(event) => {
        cancel()
        onClick?.(event)
      }}
    >
      {children}
    </button>
  )
}
const emptyMetrics: VisionMetrics = {
  fps: 0,
  inferenceP50Ms: 0,
  inferenceP95Ms: 0,
  faceDetected: false,
  eyeBlinkLeft: 0,
  eyeBlinkRight: 0,
  jawOpen: 0
}
export function DebugPanel({ gazeEnabled = false }: { gazeEnabled?: boolean }): JSX.Element {
  const [status, setStatus] = useState<VisionStatus>({
    state: 'stopped',
    message: 'Start tracking to measure this camera',
    width: 0,
    height: 0,
    cameraFps: 0
  })
  const [pointer, setPointer] = useState<PointerMetrics>({
    enabled: false,
    replay: false,
    samples: 0,
    latencyP50Ms: 0,
    latencyP95Ms: 0,
    tCapture: 0,
    tInferDone: 0,
    tPointerDone: 0,
    tMoveSent: 0,
    message: 'Pointer control is off'
  })
  const [metrics, setMetrics] = useState(emptyMetrics)
  const [paused, setPaused] = useState(false)
  const [prompt, setPrompt] = useState<IpcPayloadFor<'replay:prompt'>>({
    prompt: '',
    index: 0,
    total: 0,
    remainingMs: 0,
    state: 'idle'
  })
  useEffect(() => {
    const subscriptions = [
      window.gestura.on('pointer:metrics', setPointer),
      window.gestura.on('vision:status', setStatus),
      window.gestura.on('vision:metrics', setMetrics),
      window.gestura.on('replay:prompt', setPrompt),
      window.gestura.on('system:pause-state', (value) => setPaused(value.paused))
    ]
    window.gestura.send('app:ready', {})
    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [])
  const recording = prompt.state === 'recording' || prompt.state === 'paused'
  const measured = status.state === 'running' || status.state === 'replaying'
  return (
    <main className="debug-panel">
      <header>
        <h1>Face tracking</h1>
        <p>
          Camera pixels stay in the hidden vision process. Recording saves derived tracking data
          only.
        </p>
      </header>
      <section aria-labelledby="tracking-heading">
        <h2 id="tracking-heading">Tracking status</h2>
        <p role="status">
          {paused ? 'Globally paused' : status.state}. {status.message}
        </p>
        <div className="controls">
          <DwellButton
            disabled={
              paused || status.state === 'starting' || status.state === 'running' || recording
            }
            onClick={() => window.gestura.send('vision:control', { operation: 'start' })}
          >
            Start camera tracking
          </DwellButton>
          <DwellButton
            disabled={status.state === 'stopped' && !recording}
            onClick={() => window.gestura.send('vision:control', { operation: 'stop' })}
          >
            Stop tracking
          </DwellButton>
        </div>
        <p className="hint">
          Pause anytime: Ctrl+Option+P on macOS or Ctrl+Alt+P on Windows. Buttons also activate
          after one second of pointer dwell.
        </p>
        {status.width > 0 && (
          <p>
            Camera: {status.width} × {status.height}, {status.cameraFps.toFixed(1)} fps negotiated
          </p>
        )}
      </section>
      <section aria-labelledby="timing-heading">
        <h2 id="timing-heading">Frame timing</h2>
        <dl className="measurements">
          <div>
            <dt>Processed fps</dt>
            <dd>{measured && !paused ? metrics.fps.toFixed(1) : 'Not measured'}</dd>
          </div>
          <div>
            <dt>Inference p50</dt>
            <dd>
              {measured && !paused ? `${metrics.inferenceP50Ms.toFixed(1)} ms` : 'Not measured'}
            </dd>
          </div>
          <div>
            <dt>Inference p95</dt>
            <dd>
              {measured && !paused ? `${metrics.inferenceP95Ms.toFixed(1)} ms` : 'Not measured'}
            </dd>
          </div>
          <div>
            <dt>Face detected</dt>
            <dd>
              {measured && !paused ? (metrics.faceDetected ? 'Yes' : 'No') : 'No active frames'}
            </dd>
          </div>
        </dl>
        <p className="hint">Timing uses the latest two seconds of processed frames.</p>
      </section>
      <section aria-labelledby="pointer-heading">
        <h2 id="pointer-heading">Head pointer</h2>
        <p role="status">{pointer.message}</p>
        <div className="controls">
          <DwellButton
            disabled={paused && !pointer.enabled}
            onClick={() => window.gestura.send('pointer:control', { enabled: !pointer.enabled })}
          >
            {pointer.enabled ? 'Disable pointer control' : 'Enable pointer control'}
          </DwellButton>
        </div>
        <dl className="measurements">
          <div>
            <dt>Capture to move p50</dt>
            <dd>
              {!paused && pointer.samples > 0
                ? `${pointer.latencyP50Ms.toFixed(1)} ms`
                : 'Not measured'}
            </dd>
          </div>
          <div>
            <dt>Capture to move p95</dt>
            <dd>
              {!paused && pointer.samples > 0
                ? `${pointer.latencyP95Ms.toFixed(1)} ms`
                : 'Not measured'}
            </dd>
          </div>
        </dl>
        <p className="hint">
          Primary display only.{' '}
          {gazeEnabled
            ? 'Calibrated gaze jumps are on.'
            : 'Gaze jumps are off; enable them after gaze calibration.'}{' '}
          Replay previews never move the cursor. Timing ends when movement is sent, before OS
          delivery.
        </p>
      </section>
      <section aria-labelledby="scores-heading">
        <h2 id="scores-heading">Blendshape scores</h2>
        {(['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen'] as const).map((name) => (
          <div className="score" key={name}>
            <label htmlFor={name}>{name}</label>
            <meter id={name} min={0} max={1} value={paused || !measured ? 0 : metrics[name]} />
            <output htmlFor={name} aria-live="off">
              {(paused || !measured ? 0 : metrics[name]).toFixed(2)}
            </output>
          </div>
        ))}
        <p className="hint">Left and right refer to your face. No camera preview is sent here.</p>
      </section>
      <section aria-labelledby="fixtures-heading">
        <h2 id="fixtures-heading">Scripted fixtures</h2>
        <p>
          Follow eight prompts, five seconds each. The reading prompt captures face features; it
          does not request microphone access.
        </p>
        <div className="controls">
          <DwellButton
            disabled={paused || status.state !== 'running' || recording}
            onClick={() => window.gestura.send('replay:control', { operation: 'record' })}
          >
            Record scripted session
          </DwellButton>
          <DwellButton
            disabled={!recording}
            onClick={() => window.gestura.send('replay:control', { operation: 'stop' })}
          >
            Save recording now
          </DwellButton>
          <DwellButton
            disabled={recording || paused}
            onClick={() => window.gestura.send('replay:control', { operation: 'play' })}
          >
            Replay a JSONL fixture
          </DwellButton>
          <DwellButton
            disabled={!recording && status.state !== 'replaying'}
            onClick={() => window.gestura.send('replay:control', { operation: 'cancel' })}
          >
            Cancel session
          </DwellButton>
        </div>
        <div className="session-prompt" role="status">
          {prompt.prompt ||
            'No session active. Start tracking to record, or choose a derived fixture to replay.'}
          {recording && (
            <p>
              Prompt {prompt.index + 1} of {prompt.total} · {Math.ceil(prompt.remainingMs / 1000)}{' '}
              seconds remaining{paused ? ' · paused' : ''}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
