import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { BenchState, BenchConfig } from '@gestura/core'
import { DwellButton } from './DebugPanel'
import { DEFAULT_BENCH_OPTIONS } from '@gestura/core/config'
export function PointingBench({
  onOpenChange
}: {
  onOpenChange(open: boolean): void
}): JSX.Element {
  const [state, setState] = useState<BenchState | null>(null)
  const [mode, setMode] = useState<BenchConfig['mode']>(DEFAULT_BENCH_OPTIONS.mode)
  const [persist, setPersist] = useState(DEFAULT_BENCH_OPTIONS.persist)
  const surface = useRef<HTMLDivElement | null>(null)
  const command = (operation: 'cancel' | 'delete' | 'open' | 'close'): void =>
    window.gestura.send('bench:control', { operation })
  useEffect(() => {
    const off = window.gestura.on('bench:state', (value) => {
      setState(value)
      onOpenChange(value.open)
    })
    window.gestura.send('app:ready', {})
    return off
  }, [onOpenChange])
  useEffect(() => {
    if (!state?.running) return
    const resize = (): void => window.gestura.send('bench:control', { operation: 'cancel' })
    window.addEventListener('resize', resize)
    window.addEventListener('blur', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('blur', resize)
    }
  }, [state?.running])
  const start = (): void => {
    const rect = surface.current?.getBoundingClientRect()
    if (!rect) return
    window.gestura.send('bench:control', {
      operation: 'start',
      config: {
        mode,
        width: surface.current!.clientWidth,
        height: surface.current!.clientHeight,
        scaleFactor: window.devicePixelRatio,
        persist,
        timeoutMs: DEFAULT_BENCH_OPTIONS.timeoutMs
      }
    })
  }
  if (!state?.open)
    return (
      <section className="controls bench-launch">
        <DwellButton onClick={() => command('open')}>Open pointing benchmark</DwellButton>
      </section>
    )
  const targets =
    state.config?.mode === 'standard'
      ? state.layout.filter((t) => t.height === state.target?.height)
      : state.layout
  return (
    <main
      className="pointing-bench"
      aria-label="Pointing benchmark"
      onPointerDown={(event) => {
        if (
          !state.running ||
          state.paused ||
          !surface.current ||
          event.button > 2 ||
          (event.target instanceof Element && event.target.closest('button'))
        )
          return
        event.preventDefault()
        const rect = surface.current.getBoundingClientRect()
        window.gestura.send('bench:control', {
          operation: 'click',
          x: event.clientX - rect.left - surface.current.clientLeft,
          y: event.clientY - rect.top - surface.current.clientTop,
          button: event.button
        })
      }}
    >
      <header>
        <h1>Pointing benchmark</h1>
        <p>{state.message}</p>
        <div className="controls">
          {!state.running && (
            <>
              <DwellButton aria-pressed={mode === 'standard'} onClick={() => setMode('standard')}>
                A: standard targets
              </DwellButton>
              <DwellButton aria-pressed={mode === 'realistic'} onClick={() => setMode('realistic')}>
                B: realistic controls
              </DwellButton>
              <DwellButton aria-pressed={persist} onClick={() => setPersist(!persist)}>
                {persist ? 'Local saving on' : 'Local saving off'}
              </DwellButton>
              <DwellButton disabled={state.paused} onClick={start}>
                Start trials
              </DwellButton>
              <DwellButton onClick={() => command('delete')}>Delete local results</DwellButton>
              <DwellButton onClick={() => command('close')}>Back to tracking settings</DwellButton>
            </>
          )}
          {state.running && (
            <DwellButton onClick={() => command('cancel')}>End session</DwellButton>
          )}
          <DwellButton onClick={() => window.gestura.send('system:toggle-pause', {})}>
            {state.paused ? 'Resume input' : 'Pause input'}
          </DwellButton>
        </div>
        <p>
          {state.running
            ? `Trial ${state.index + 1} of ${state.total}: ${state.target?.label} (${state.target?.width} × ${state.target?.height} CSS px)`
            : 'Set up tracking and blink/dwell clicks in settings before starting. Small measured targets are intentional. Start collects local trial and latency data; only Local saving on writes files, replacing the previous run.'}
        </p>
        <p className="bench-scale">
          {state.paused ? 'Paused. ' : ''}100% browser zoom uses CSS px; device scale{' '}
          {window.devicePixelRatio}. Resize or leaving this window ends the session. Each trial
          allows 30 seconds of active time.
        </p>
      </header>
      <div
        ref={surface}
        className="bench-surface"
        aria-label="Target selection area"
        onContextMenu={(event) => event.preventDefault()}
      >
        {state.running &&
          targets.map((target) => (
            <div
              key={target.id}
              className={`bench-target bench-${target.role} ${target.id === state.target?.id ? 'active' : ''}`}
              style={{ left: target.x, top: target.y, width: target.width, height: target.height }}
              aria-label={`${target.label}${target.id === state.target?.id ? ' active target' : ''}`}
            >
              {target.role === 'target'
                ? ''
                : target.role === 'toolbar'
                  ? ['＋', '▱', '▣', '↶', '↷', '▤'][Number(target.id.split('-')[1])]
                  : target.label}
            </div>
          ))}
        {!state.running && (
          <div className="bench-empty">
            <p>Mode A alternates around 13 positions at each of 16, 24, 32 and 48 px.</p>
            <p>
              Mode B contains toolbar icons, menus, tabs, links and 20 px spreadsheet cells. Select
              only the highlighted control.
            </p>
          </div>
        )}
        {state.paused && (
          <div className="bench-paused">
            Input paused. Use Resume input, the pause hotkey or the overlay corner.
          </div>
        )}
      </div>
      {state.report && (
        <section className="bench-report" aria-label="Benchmark results">
          <h2>Session summary</h2>
          <pre>{state.report}</pre>
        </section>
      )}
    </main>
  )
}
