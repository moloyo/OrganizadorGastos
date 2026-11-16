import type { DataAdapter } from '../../types'
import { resolveAppMode } from '../appMode'
import { createLocalAdapter } from './local'
import { createCloudAdapter } from './cloud'
import { createOfflineAdapter } from './offline'
import { newUuid } from '../uuid'

function normalizeUrl(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '')
}

const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL ?? '')
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

const mode = resolveAppMode({
  url,
  key,
  mode: import.meta.env.MODE,
  e2eLocal: import.meta.env.VITE_E2E_LOCAL,
})

/** La app está configurada para funcionar (siempre con cuentas, salvo el modo de test). */
export const appConfigured = mode !== 'unconfigured'
/** Hay Supabase configurado y por lo tanto se pide iniciar sesión. */
export const cloudConfigured = mode === 'cloud'

let adapter: DataAdapter | null = null

export function getAdapter(): DataAdapter {
  if (!adapter) {
    if (mode === 'e2e-local') {
      adapter = createLocalAdapter()
    } else if (mode === 'cloud') {
      adapter = createOfflineAdapter(createCloudAdapter(url, key))
    } else {
      throw new Error(
        'Falta configurar Supabase. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
      )
    }
  }
  return adapter
}

export function makeId(): string {
  return newUuid()
}
