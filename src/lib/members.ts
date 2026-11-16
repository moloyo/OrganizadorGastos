import type { HouseholdMember, SessionUser } from '../types'

/** Ids de quienes participan del hogar; si todavía no cargó, sólo el usuario actual. */
export function memberIdsOf(
  members: HouseholdMember[],
  user: Pick<SessionUser, 'id'> | null,
): string[] {
  if (members.length > 0) return members.map((member) => member.userId)
  return user ? [user.id] : []
}

/** `Vos` para el usuario actual, su email para el resto. Un id desconocido (cuenta borrada) es "Otra persona". */
export function memberLabel(
  id: string,
  members: HouseholdMember[],
  currentUserId?: string | null,
): string {
  if (id === currentUserId) return 'Vos'
  return members.find((member) => member.userId === id)?.email || 'Otra persona'
}
