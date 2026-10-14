import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DebugPanel } from './DebugPanel'
import '../shared/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Control renderer root is missing')
createRoot(root).render(
  <StrictMode>
    <DebugPanel />
  </StrictMode>
)
