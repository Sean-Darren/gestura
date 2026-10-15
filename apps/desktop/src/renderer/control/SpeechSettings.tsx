import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SpeechStatus, Transcript } from '@gestura/core'
import { DwellButton } from './DebugPanel'

export function SpeechSettings(): JSX.Element {
  const [state, setState] = useState<SpeechStatus>({
    state: 'off',
    micLive: false,
    message: 'Listening is off'
  })
  const [last, setLast] = useState<Transcript | null>(null)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    const offState = window.gestura.on('speech:state', (value) => {
      setState(value)
      if (value.state === 'off' || value.state === 'error') setLast(null)
    })
    const offText = window.gestura.on('speech:transcript', setLast)
    const offPause = window.gestura.on('system:pause-state', (value) => setPaused(value.paused))
    window.gestura.send('app:ready', {})
    return () => {
      offState()
      offText()
      offPause()
    }
  }, [])
  const enabled = !['off', 'error'].includes(state.state)
  return (
    <section className="speech-settings" aria-labelledby="speech-heading">
      <h2 id="speech-heading">Local speech</h2>
      <p>
        Microphone audio stays on this device and is never saved. Recognition uses local models.
      </p>
      <div className="controls">
        <DwellButton
          disabled={paused && !enabled}
          aria-pressed={enabled}
          onClick={() => window.gestura.send('speech:control', { enabled: !enabled })}
        >
          {enabled ? 'Stop listening' : 'Start listening'}
        </DwellButton>
        <span role="status">{state.message}</span>
      </div>
      {paused && <p>Resume input before starting listening.</p>}
      <p>
        {state.micLive ? 'Microphone live' : 'Microphone off'}. Global pause stops listening;
        restart it here after resuming.
      </p>
      <p>Transcripts are previews. They do not insert text or run commands.</p>
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
