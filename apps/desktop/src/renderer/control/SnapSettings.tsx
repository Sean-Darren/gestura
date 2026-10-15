import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SnapSettings as Settings } from '@gestura/core'
import { DwellButton } from './DebugPanel'
export function SnapSettings(): JSX.Element {
  const [state, setState] = useState<Settings>({
    foreground: null,
    apps: [],
    message: 'Start calibrated head control to discover apps. Snapping starts off.'
  })
  useEffect(() => {
    const off = window.gestura.on('snap:settings', setState)
    window.gestura.send('app:ready', {})
    return off
  }, [])
  return (
    <section className="snap-settings" aria-labelledby="snap-heading">
      <h2 id="snap-heading">Target snapping</h2>
      <p>
        Move freely. An outlined target receives the next gesture click at its center. Blink
        freezing and pause still apply.
      </p>
      <p role="status">{state.message}</p>
      {!state.apps.length && (
        <p>
          Bring an app forward while head control is active, then return here to enable snapping for
          it. No speech is required.
        </p>
      )}
      <ul>
        {state.apps.map((app) => (
          <li key={app.appId} className="controls">
            <span className="snap-app-id">
              {app.appId}
              {state.foreground === app.appId ? ' (last observed)' : ''}
            </span>
            <DwellButton
              disabled={app.blocked}
              aria-pressed={app.enabled}
              onClick={() =>
                window.gestura.send('snap:control', { appId: app.appId, enabled: !app.enabled })
              }
            >
              {app.blocked
                ? 'Off: poor coverage'
                : app.enabled
                  ? 'Snapping on: switch off'
                  : 'Snapping off: switch on'}
            </DwellButton>
            {app.blocked && <p>{app.reason}</p>}
          </li>
        ))}
      </ul>
      <p>
        Preferences stay on this device. App IDs are shown so the correct app can be selected.
        Window titles and control names are not saved.
      </p>
    </section>
  )
}
