import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GestureOverlay } from './GestureOverlay'
import '../shared/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Overlay renderer root is missing')

createRoot(root).render(
  <StrictMode>
    <GestureOverlay />
  </StrictMode>
)
