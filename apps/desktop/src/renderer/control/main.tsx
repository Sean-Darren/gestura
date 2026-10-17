import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DesktopConnection } from '../shared/DesktopConnection'
import { CalibrationControl } from './CalibrationWizard'
import '../shared/styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Control renderer root is missing')
createRoot(root).render(
  <StrictMode>
    <DesktopConnection>
      <CalibrationControl />
    </DesktopConnection>
  </StrictMode>
)
