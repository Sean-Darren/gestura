import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ShellApp } from '../shared/ShellApp'
import '../shared/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Vision renderer root is missing')

createRoot(root).render(
  <StrictMode>
    <ShellApp title="Gestura Vision" />
  </StrictMode>
)
