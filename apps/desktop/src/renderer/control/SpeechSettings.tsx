import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { PaletteState, SpeechStatus, Transcript } from '@gestura/core'
import { DwellButton } from './DebugPanel'

export function SpeechSettings(): JSX.Element {
  const [state, setState] = useState<SpeechStatus>({
    state: 'off',
    micLive: false,
    message: 'Listening is off'
  })
  const [last, setLast] = useState<Transcript | null>(null)
  const [paused, setPaused] = useState(false)
  const [palette, setPalette] = useState<PaletteState | null>(null)
  useEffect(() => {
    const offState = window.gestura.on('speech:state', (value) => {
      setState(value)
      if (value.state === 'off' || value.state === 'error') setLast(null)
    })
    const offText = window.gestura.on('speech:transcript', setLast)
    const offPause = window.gestura.on('system:pause-state', (value) => setPaused(value.paused))
    const offPalette = window.gestura.on('palette:state', setPalette)
    window.gestura.send('app:ready', {})
    return () => {
      offState()
      offText()
      offPause()
      offPalette()
    }
  }, [])
  const enabled = !['off', 'error'].includes(state.state)
  return (
    <section
      className="speech-settings"
      aria-labelledby="speech-heading"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && palette?.open)
          window.gestura.send('palette:control', { operation: 'activate', id: 'palette' })
      }}
    >
      <h2 id="speech-heading">Local speech</h2>
      <p>
        Microphone audio stays on this device and is never saved. Recognition uses local models.
      </p>
      <div className="controls">
        <DwellButton
          disabled={(paused || palette?.settings.gazeOnly) && !enabled}
          aria-pressed={enabled}
          onClick={() => window.gestura.send('speech:control', { enabled: !enabled })}
        >
          {enabled ? 'Stop listening' : 'Start listening'}
        </DwellButton>
        <span role="status">{state.message}</span>
      </div>
      {palette && (
        <div className="controls">
          <DwellButton
            aria-pressed={palette.settings.gazeOnly}
            disabled={paused}
            onClick={() =>
              window.gestura.send('palette:control', {
                operation: 'settings',
                settings: { ...palette.settings, gazeOnly: !palette.settings.gazeOnly }
              })
            }
          >
            {palette.settings.gazeOnly ? 'Gaze-only on · mic off' : 'Enable gaze-only mode'}
          </DwellButton>
          <DwellButton
            disabled={paused}
            onClick={() =>
              window.gestura.send('palette:control', { operation: 'activate', id: 'palette' })
            }
          >
            Toggle phrase palette
          </DwellButton>
          <p role="status">{palette.message}</p>
        </div>
      )}
      {palette?.open && (
        <section aria-label="Keyboard-accessible phrase palette" className="palette-control-copy">
          <h3>Phrase palette controls</h3>
          <p>
            For insertion into another app, focus that app and use the overlay. These controls also
            support keyboard navigation.
          </p>
          {palette.composer && (
            <label>
              Draft text
              <textarea
                maxLength={10000}
                value={palette.draft}
                onChange={(event) =>
                  window.gestura.send('palette:control', {
                    operation: 'draft',
                    text: event.target.value
                  })
                }
              />
            </label>
          )}
          <div className="palette-control-grid">
            {palette.tiles.map((tile) => (
              <DwellButton
                key={tile.id}
                disabled={tile.disabled}
                onClick={() =>
                  window.gestura.send('palette:control', { operation: 'activate', id: tile.id })
                }
              >
                {tile.label}
              </DwellButton>
            ))}
          </div>
        </section>
      )}
      {paused && <p>Resume input before starting listening.</p>}
      <p>
        {state.micLive ? 'Microphone live' : 'Microphone off'}. Global pause stops listening;
        restart it here after resuming.
      </p>
      <p>
        Hold your mouth open to toggle listening, use the overlay Listen tile, or press
        Ctrl+Option+L on macOS / Ctrl+Alt+L on Windows. Global pause remains Ctrl+Option+P /
        Ctrl+Alt+P.
      </p>
      <p>
        Turn dictation on in the palette or say “dictation on”. Speech adds to a proposal. Review
        it, then say “confirm” or hold your mouth open for one second. Blink and dwell never confirm
        text.
      </p>
      <p>
        The palette includes gaze-operated phrase editing and a character composer. Paste previews
        the clipboard before insertion. Undo that is limited to the recent Gestura insertion in the
        same app and window; check the app’s undo grouping.
      </p>
      {last && (
        <div className="speech-preview" aria-live="polite">
          <p lang={last.lang === 'yue' || last.lang === 'zh' ? 'zh-HK' : last.lang}>{last.text}</p>
          <p>
            {last.lang === 'unknown' ? 'Language not reported' : last.lang}:{' '}
            {(last.tDone - last.tSpeechEnd).toFixed(0)} ms after detected speech end
          </p>
        </div>
      )}
    </section>
  )
}
