import { useEffect } from 'react'
import type { JSX } from 'react'
import type { FormulaLoopState } from '@gestura/core'
export function FormulaCard({
  state,
  hold
}: {
  state: FormulaLoopState | null
  hold: number
}): JSX.Element | null {
  const id = state?.proposalId,
    page = state?.reviewPage,
    pages = state?.reviewPages
  useEffect(() => {
    if (!id || page !== (pages ?? 1) - 1) return
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
  if (!state?.bounds || ['idle', 'cancelled'].includes(state.phase)) return null
  const busy = ['thinking', 'correcting', 'writing', 'restoring'].includes(state.phase)
  const title =
    state.phase === 'thinking'
      ? 'Thinking'
      : state.phase === 'correcting'
        ? `Thinking · correction ${state.correction}`
        : state.phase === 'written'
          ? 'Formula written'
          : state.phase === 'undo-proposed'
            ? 'Review undo'
            : state.phase === 'writing'
              ? 'Writing formula'
              : state.phase === 'restoring'
                ? 'Restoring cell'
                : state.phase === 'error'
                  ? 'Formula unavailable'
                  : state.phase === 'clarification'
                    ? 'More detail needed'
                    : state.correction
                      ? `Review formula · correction ${state.correction}`
                      : 'Review formula'
  return (
    <section
      className="formula-card"
      aria-label="Excel formula proposal"
      aria-busy={busy}
      style={{
        left: state.bounds.x,
        top: state.bounds.y,
        width: state.bounds.width,
        height: state.bounds.height
      }}
    >
      <div className="formula-card-body">
        <h2>{title}</h2>
        <p className="formula-target">{state.target || 'Excel'}</p>
        {!busy && state.formula && state.reviewKind === 'formula' && (
          <pre aria-label="Formula" className="formula-code">
            {state.reviewText}
          </pre>
        )}
        {busy ? (
          <p role="status">{state.explanation}</p>
        ) : (
          <>
            {(state.reviewKind === 'explanation' || !state.formula) && (
              <p lang={state.lang === 'en' ? 'en' : 'zh-HK'} className="formula-explanation">
                {state.reviewKind === 'explanation' ? state.reviewText : state.explanation}
              </p>
            )}
            {state.reviewKind === 'previous' && (
              <div className="formula-previous">
                <p>Previous content to restore</p>
                <pre>{state.reviewText}</pre>
              </div>
            )}
            {!!state.references.length && (
              <p className="formula-references">
                Columns: {state.references.slice(0, 4).join(', ')}
                {state.references.length > 4
                  ? ` +${state.references.length - 4} more selected`
                  : ''}
              </p>
            )}
            <p>
              Review {state.reviewPage + 1}/{state.reviewPages} · Next text to continue
            </p>
            {['proposed', 'undo-proposed'].includes(state.phase) && (
              <div className="formula-confirmation">
                <svg
                  className="confirmation-ring"
                  viewBox="0 0 40 40"
                  role="img"
                  aria-label={`${(1 - hold).toFixed(1)} seconds of mouth hold remaining`}
                >
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#a6b7aa" strokeWidth="4" />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke="#24563d"
                    strokeWidth="4"
                    strokeDasharray={`${hold * 101} 101`}
                    transform="rotate(-90 20 20)"
                  />
                </svg>
                <p>
                  Review every page, then say “confirm” / 「確認」 or hold your mouth open for 1 s.
                </p>
              </div>
            )}
            {state.phase === 'written' && (
              <p>Say “undo that” after reviewing the previous content, or dwell on Undo that.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
