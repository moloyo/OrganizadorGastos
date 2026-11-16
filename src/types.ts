export type CurrencyCode = 'EUR' | 'ARS' | 'USD'
export type Recurrence = 'none' | 'monthly'

export interface Expense {
  id: string
  description: string
  /** Siempre en centavos: evita errores de coma flotante con dinero. */
  amountCents: number
  category: string
  /** ISO `yyyy-MM-dd` (día en que se hizo el gasto). */
  spentOn: string
  note: string
  /** userId de quien pagó. Por defecto, quien cargó el gasto. */
  paidBy: string
  /** userId -> puntos básicos (10000 = 100 %). Suma siempre 10000. */
  shares: Record<string, number>
  /** Moneda en la que se pagó. */
  currency: CurrencyCode
  /** Equivalente en la moneda base del hogar; se usa para todos los totales. */
  baseAmountCents: number
  /** Viaje al que pertenece; null = gastos del hogar. */
  tripId?: string | null
  recurrence: Recurrence
  /** Identificador compartido por las cuotas de un gasto mensual. */
  recurrenceGroupId?: string | null
  createdAt: string
}

/** Pago de un miembro a otro: descuenta del saldo en vez de sumar un gasto. */
export interface Transfer {
  id: string
  from: string
  to: string
  amountCents: number
  currency: CurrencyCode
  baseAmountCents: number
  note: string
  paidOn: string
  tripId?: string | null
  createdAt: string
}

/** Bolsillo independiente con su propia moneda base. */
export interface Trip {
  id: string
  name: string
  baseCurrency: CurrencyCode
  startsOn: string
  endsOn: string
  archived: boolean
}

export interface SessionUser {
  id: string
  email: string
  /** Hogar al que pertenece la sesión. Si falta, se usa el id de usuario. */
  householdId?: string | null
  householdName?: string | null
}

/** Un hogar comparte gastos entre todos sus miembros. */
export interface Household {
  id: string
  name: string
  role: 'owner' | 'member'
  memberCount: number
  baseCurrency: CurrencyCode
}

export interface HouseholdMember {
  userId: string
  email: string
  role: 'owner' | 'member'
  joinedAt: string
}

export interface HouseholdInvite {
  token: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  usedCount: number
}

/** Datos públicos de una invitación (los ve quien todavía no es miembro). */
export interface InviteInfo {
  householdId: string
  householdName: string
  memberCount: number
  expiresAt: string
}

export interface Snapshot {
  app: 'gastos'
  version: 1
  exportedAt: string
  expenses: Expense[]
}

export interface OfflineStatus {
  online: boolean
  pending: number
  syncing: boolean
  lastError: { message: string; at: number } | null
}

export interface OfflineSupport {
  getStatus(): OfflineStatus
  subscribe(cb: (status: OfflineStatus) => void): () => void
  flush(): Promise<void>
  rescope?(scopeId: string | null): void
}

/** Operaciones de hogar. El modo local las resuelve en memoria para los tests. */
export interface HouseholdAdapter {
  getHousehold(): Promise<Household | null>
  renameHousehold(name: string): Promise<void>
  setHouseholdBaseCurrency(code: CurrencyCode): Promise<void>
  listHouseholdMembers(): Promise<HouseholdMember[]>
  createHouseholdInvite(): Promise<HouseholdInvite>
  listHouseholdInvites(): Promise<HouseholdInvite[]>
  revokeHouseholdInvite(token: string): Promise<void>
  getHouseholdInviteInfo(token: string): Promise<InviteInfo | null>
  joinHousehold(token: string): Promise<Household>
  leaveHousehold(): Promise<void>
}

export interface DataAdapter extends HouseholdAdapter {
  kind: 'cloud' | 'local'
  offline?: OfflineSupport

  getUser(): Promise<SessionUser | null>
  onAuthChange(cb: (user: SessionUser | null) => void): () => void
  /** Señal de Realtime: quien la recibe debe releer del servidor. */
  subscribeToChanges(onChange: () => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  deleteAccount(): Promise<void>

  listExpenses(): Promise<Expense[]>
  saveExpense(expense: Expense): Promise<Expense>
  saveExpenses(expenses: Expense[]): Promise<void>
  deleteExpense(id: string): Promise<void>
  clearExpenses(): Promise<void>

  listTransfers(): Promise<Transfer[]>
  addTransfer(transfer: Transfer): Promise<void>
  deleteTransfer(id: string): Promise<void>

  listTrips(): Promise<Trip[]>
  createTrip(trip: Trip): Promise<void>
  deleteTrip(id: string): Promise<void>

  exportAll(): Promise<Snapshot>
  importAll(snapshot: Snapshot): Promise<void>
  wipe(): Promise<void>
}
