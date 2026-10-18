import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { PaletteState } from '@gestura/core'

export function PhrasePalette(): JSX.Element | null {
  const [state, setState] = useState<PaletteState | null>(null)
  useEffect(() => {
    const off = window.gestura.on('palette:state', setState)
    window.gestura.send('app:ready', {})
    return off
  }, [])
  const id = state?.pending?.id
  const page = state?.reviewPage
  const pages = state?.reviewPages
  useEffect(() => {
    if (!id || page !== (pages ?? 1) - 1) return
    // Two paints precede the acknowledgement; main supplies its own presentation timestamp.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        window.gestura.send('palette:control', { operation: 'shown', id })
      )
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [id, page, pages])
  if (!state) return null
  return (
    <section className="phrase-overlay" aria-label="Hands-free phrase palette">
      {state.pending && (
        <section className="proposal-card" aria-label="Text proposal">
          <h2>
            Review before inserting{' '}
            <span>
              {state.reviewPage + 1}/{state.reviewPages}
            </span>
          </h2>
          <p className="proposal-target">Destination: {state.pending.target}</p>
          <pre>{state.reviewText}</pre>
          <p>{state.message} Blink and dwell cannot confirm.</p>
          <progress max={1} value={state.holdProgress} aria-label="Mouth confirmation countdown" />
          <span className="mouth-countdown">
            {(1 - state.holdProgress).toFixed(1)} s mouth hold remaining
          </span>
        </section>
      )}
      {state.open && (
        <header className="palette-heading" style={{ top: state.pending ? 362 : 82 }}>
          <h2>
            {state.formulaListening
              ? 'Formula request'
              : state.composer
                ? `Compose ${state.composer}`
                : 'Phrase palette'}
          </h2>
          <p>
            {state.formulaListening
              ? 'Listening — say the formula, then close and open your mouth to finish.'
              : state.settings.gazeOnly
                ? 'Gaze-only · microphone off'
                : state.dictating
                  ? 'Dictation on'
                  : 'Dwell or blink to select'}
          </p>
          {state.formulaListening ? (
            <>
              <div className="palette-draft" role="status" aria-label="Captured formula request">
                {state.draft || 'Listening for formula request…'}
              </div>
              <progress
                className="formula-hold-progress"
                max={1}
                value={state.holdProgress}
                aria-label="Formula request finish hold"
              />
              <span className="mouth-countdown">
                {(1 - state.holdProgress).toFixed(1)} s mouth hold remaining
              </span>
            </>
          ) : state.composer ? (
            <div
              className="palette-draft"
              role="textbox"
              aria-label="Draft text"
              aria-readonly="true"
            >
              {state.draft || 'Choose characters below. Use draft creates a proposal.'}
            </div>
          ) : null}
        </header>
      )}
      {state.tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          className={`palette-tile ${state.dwellId === tile.id ? 'dwelling' : ''}`}
          style={{
            left: tile.bounds.x,
            top: tile.bounds.y,
            width: tile.bounds.width,
            height: tile.bounds.height
          }}
          disabled={tile.disabled}
          aria-pressed={
            tile.id === 'gaze-only'
              ? state.settings.gazeOnly
              : tile.id === 'palette'
                ? state.open
                : undefined
          }
          onClick={() =>
            window.gestura.send('palette:control', { operation: 'activate', id: tile.id })
          }
        >
          {tile.label}
          {state.dwellId === tile.id && (
            <progress max={1} value={state.dwellProgress} aria-label="Tile dwell progress" />
          )}
        </button>
      ))}
      {!state.pending && (
        <p className="palette-status" role="status">
          {state.busy ? 'Inserting confirmed text…' : state.message}
        </p>
      )}
    </section>
  )
}
