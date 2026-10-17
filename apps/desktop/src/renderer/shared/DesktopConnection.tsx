import { useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { connectDesktop } from './desktop-connection'
import type { DesktopConnectionState } from './desktop-connection'

export function DesktopConnection({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<DesktopConnectionState>('connecting')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => connectDesktop(window.gestura, setState), [attempt])
  if (state === 'ready') return <>{children}</>
  return (
    <main>
      <h1>Connect to Gestura</h1>
      <p role={state === 'unavailable' ? 'alert' : 'status'}>
        {state === 'connecting'
          ? 'Connecting to the desktop app…'
          : 'The desktop connection is unavailable. Open Gestura using pnpm dev and use its desktop window. A browser preview cannot control your computer.'}
      </p>
      {state === 'unavailable' && (
        <div className="controls">
          <button onClick={() => setAttempt((value) => value + 1)}>Retry connection</button>
        </div>
      )}
    </main>
  )
}
