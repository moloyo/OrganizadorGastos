import type { OfflineStatus } from '../types'

/**
 * Solo refrescamos desde Realtime cuando no hay escrituras locales en vuelo:
 * releer del servidor podría pisar lo que el usuario acaba de escribir.
 */
export function shouldRefreshFromRealtime(status: OfflineStatus): boolean {
  return status.online && status.pending === 0 && !status.syncing
}

/** Ignoramos nuestros propios broadcasts; otras pestañas del mismo usuario sí refrescan. */
export function isOwnBroadcast(from: unknown, instanceId: string): boolean {
  return typeof from === 'string' && from === instanceId
}
