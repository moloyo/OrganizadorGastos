const KEY = 'gastos:recovery'

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/**
 * Supabase puede limpiar el hash del link de recuperación antes de que React
 * monte. Guardamos la intención apenas arranca la página.
 */
function detect(): void {
  try {
    const hash = window.location.hash.replace(/^#\/?/, '')
    if (/(?:^|&)type=recovery(?:&|$)/.test(hash)) safeSession()?.setItem(KEY, '1')
  } catch {
    // ignoramos
  }
}

if (typeof window !== 'undefined') detect()

export function recoveryPending(): boolean {
  return safeSession()?.getItem(KEY) === '1'
}

export function clearRecovery(): void {
  safeSession()?.removeItem(KEY)
}
