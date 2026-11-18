import type { HouseholdMember, SessionUser } from '../types'

/** Ids de quienes participan del hogar; si todavía no cargó, sólo el usuario actual. */
export function memberIdsOf(
  members: HouseholdMember[],
  user: Pick<SessionUser, 'id'> | null,
): string[] {
  if (members.length > 0) return members.map((member) => member.userId)
  return user ? [user.id] : []
}

/** `Vos` para el usuario actual, el nombre del resto. Un id desconocido es "Otra persona". */
export function memberLabel(
  id: string,
  members: HouseholdMember[],
  currentUserId?: string | null,
): string {
  if (id === currentUserId) return 'Vos'
  const member = members.find((item) => item.userId === id)
  return member?.name || member?.email || 'Otra persona'
}

/** Nombre de una persona, sin el "Vos" (para usar en listados compartidos). */
export function displayNameOf(id: string, members: HouseholdMember[]): string {
  const member = members.find((item) => item.userId === id)
  return member?.name || member?.email || 'Otra persona'
}
