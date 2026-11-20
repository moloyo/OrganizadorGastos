import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './lib/recovery'
import { captureInvite } from './lib/invite'
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/nunito'
import '@fontsource/patrick-hand'
import './index.css'
import App from './App'
import { applyTheme, readTheme } from './lib/theme'

// Antes de pintar: tema guardado (evita el destello) e invitación pendiente
// (Supabase puede reescribir el hash al detectar la sesión).
applyTheme(readTheme())
captureInvite()

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
