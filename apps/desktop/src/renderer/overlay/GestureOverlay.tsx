import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { OverlayState } from '@gestura/core'
export function GestureOverlay(): JSX.Element {
  const [state, setState] = useState<OverlayState | null>(null)
  const [flash, setFlash] = useState<OverlayState['click']>(null)
  useEffect(() => {
    const off = window.gestura.on('gestures:state', (value) => {
      setState(value)
      if (value.click && performance.timeOrigin + performance.now() - value.click.t < 250)
        setFlash(value.click)
    })
    window.gestura.send('app:ready', {})
    return off
  }, [])
  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 200)
    return () => clearTimeout(timer)
  }, [flash])
  if (!state) return <div aria-label="Gesture overlay connecting" />
  const cursor = state.cursor
  return (
    <div className="gesture-overlay" aria-label="Gestura gesture feedback">
      <button
        className="pause-corner"
        style={{ width: state.pauseTargetSize, height: state.pauseTargetSize }}
        aria-label={state.paused ? 'Resume input by corner dwell' : 'Pause input by corner dwell'}
        onClick={() => window.gestura.send('system:toggle-pause', {})}
      >
        {state.paused ? 'Resume' : 'Pause'}
        <progress max={1} value={state.pauseProgress} aria-label="Pause dwell progress" />
      </button>
      {state.paused && (
        <div className="pause-note" role="status">
          Input paused. Camera stays local for head-dwell resume. Leave the corner, then dwell to
          resume. Stop Tracking turns the camera off.
        </div>
      )}
      {cursor && (
        <div
          className={`gesture-pointer ${state.frozen ? 'frozen' : ''}`}
          style={{ left: cursor.x, top: cursor.y }}
          aria-label={state.frozen ? 'Cursor frozen' : 'Pointer position'}
        >
          <svg viewBox="0 0 40 40" aria-label="Click dwell progress">
            <circle cx="20" cy="20" r="17" fill="none" stroke="white" strokeWidth="6" />
            <circle
              cx="20"
              cy="20"
              r="17"
              fill="none"
              stroke="#17211d"
              strokeWidth="3"
              strokeDasharray={`${state.dwellProgress * 107} 107`}
              transform="rotate(-90 20 20)"
            />
          </svg>
        </div>
      )}
      {flash && (
        <div
          className="gesture-click"
          style={{ left: flash.x, top: flash.y }}
          role="status"
          aria-label={`${flash.button} click`}
        />
      )}
    </div>
  )
}
