/**
 * Manejo del link de invitación a un hogar.
 * El link vive en el hash (`#/unirse/<token>`) porque la app usa HashRouter.
 * Se captura apenas arranca la página y se guarda en `sessionStorage`, así
 * sobrevive al login/registro (Supabase puede reescribir el hash).
 */
const KEY = 'gastos:invite'
const TOKEN_RE =
  /^#\/unirse\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

function safeStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function buildInviteLink(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#/unirse/${token}`
}

export function inviteTokenFromHash(hash: string = window.location.hash): string | null {
  const match = TOKEN_RE.exec(hash)
  return match ? match[1] : null
}

export function captureInvite(): string | null {
  const token = inviteTokenFromHash()
  if (!token) return null
  safeStorage()?.setItem(KEY, token)
  return token
}

export function readPendingInvite(): string | null {
  return safeStorage()?.getItem(KEY) ?? inviteTokenFromHash()
}

export function clearPendingInvite(): void {
  safeStorage()?.removeItem(KEY)
  if (inviteTokenFromHash()) {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#/`,
    )
  }
}
