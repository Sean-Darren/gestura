import { useEffect, useState } from 'react'
import type { JSX } from 'react'

interface ShellAppProps {
  title: string
  overlay?: boolean
}

export function ShellApp({ title, overlay = false }: ShellAppProps): JSX.Element {
  const [status, setStatus] = useState('Connecting')

  useEffect(() => {
    const unsubscribe = window.gestura.on('app:status', ({ status: nextStatus }) => {
      setStatus(nextStatus)
    })
    window.gestura.send('app:ready', {})
    return unsubscribe
  }, [])

  if (overlay) return <div aria-label={title} className="overlay-placeholder" />

  return (
    <main>
      <h1>{title}</h1>
      <p>Desktop shell ready: {status}</p>
    </main>
  )
}
