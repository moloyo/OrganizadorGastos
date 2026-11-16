export type AppMode = 'cloud' | 'e2e-local' | 'unconfigured'

export interface ModeEnv {
  url: string
  key: string
  /** `import.meta.env.MODE` */
  mode: string
  /** `import.meta.env.VITE_E2E_LOCAL` */
  e2eLocal: string | undefined
}

/**
 * La app real siempre funciona con cuenta en Supabase.
 * El modo local queda solo para los tests de Playwright: exige a la vez el modo
 * `e2e` y `VITE_E2E_LOCAL=1`, así una build de producción nunca puede
 * saltearse el login por accidente.
 */
export function resolveAppMode(env: ModeEnv): AppMode {
  if (env.mode === 'e2e' && env.e2eLocal === '1') return 'e2e-local'
  return env.url.trim() && env.key.trim() ? 'cloud' : 'unconfigured'
}
