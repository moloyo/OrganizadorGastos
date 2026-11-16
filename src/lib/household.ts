import type { Household } from '../types'

/**
 * "Salir del hogar" solo tiene sentido si queda otro miembro: la RPC borra el
 * hogar vacío y el cascade se lleva todos los gastos. Con un único miembro
 * ocultamos la opción en la UI para no perder datos por un botón.
 */
export function canLeaveHousehold(household: Household | null): boolean {
  return Boolean(household && household.memberCount > 1)
}
