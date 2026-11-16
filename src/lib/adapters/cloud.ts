import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type {
  DataAdapter,
  Expense,
  Household,
  HouseholdInvite,
  HouseholdMember,
  InviteInfo,
  SessionUser,
  Snapshot,
} from '../../types'
import { isUuid, newUuid } from '../uuid'
import { isCurrency, withCurrencyDefaults } from '../currency'
import { isOwnBroadcast } from '../realtime'
import { isOfflineError } from './offline'

interface ExpenseRow {
  id: string
  household_id: string
  description: string
  amount_cents: number
  category: string
  spent_on: string
  note: string | null
  paid_by: string
  shares: Record<string, number>
  currency: string
  base_amount_cents: number
  created_at: string
}

interface HouseholdRow {
  id: string
  name: string
  role: 'owner' | 'member'
  member_count: number | string
  base_currency: string
}

interface MemberRow {
  user_id: string
  email: string | null
  role: 'owner' | 'member'
  joined_at: string
}

interface InviteRow {
  token: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  used_count: number | string
}

interface InviteInfoRow {
  household_id: string
  household_name: string
  member_count: number | string
  expires_at: string
}

interface JoinRow {
  household_id: string
  name: string
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null
  return (data as T) ?? null
}

function rpcRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : data ? [data as T] : []
}

function migrationHint(error: { message?: string; code?: string }): Error {
  const message = error.message ?? 'Error desconocido'
  if (
    error.code === 'PGRST202' ||
    /function .* does not exist/i.test(message) ||
    /could not find the function/i.test(message) ||
    /schema cache/i.test(message)
  ) {
    return new Error(
      'Faltan las migraciones de Supabase: ejecutá npm run db:push (o el SQL de supabase/migrations/).',
    )
  }
  return new Error(message)
}

function toUser(
  user: User | null | undefined,
  householdId?: string | null,
  householdName?: string | null,
): SessionUser | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? '',
    householdId: householdId ?? null,
    householdName: householdName ?? null,
  }
}

function mapExpense(row: ExpenseRow): Expense {
  return withCurrencyDefaults({
    id: row.id,
    description: row.description,
    amountCents: row.amount_cents,
    category: row.category,
    spentOn: row.spent_on,
    note: row.note ?? '',
    paidBy: row.paid_by,
    shares: row.shares,
    currency: isCurrency(row.currency) ? row.currency : 'EUR',
    baseAmountCents: row.base_amount_cents,
    createdAt: row.created_at,
  })
}

function toExpenseRow(expense: Expense, householdId: string): ExpenseRow {
  return {
    id: expense.id,
    household_id: householdId,
    description: expense.description,
    amount_cents: expense.amountCents,
    category: expense.category,
    spent_on: expense.spentOn,
    note: expense.note,
    paid_by: expense.paidBy,
    shares: expense.shares,
    currency: expense.currency,
    base_amount_cents: expense.baseAmountCents,
    created_at: expense.createdAt,
  }
}

const HOUSEHOLD_KEY = (userId: string) => `gastos:household:v1:${userId}`

function readCachedHouseholdId(userId: string): string | null {
  try {
    return typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(HOUSEHOLD_KEY(userId))
  } catch {
    return null
  }
}

function writeCachedHouseholdId(userId: string, householdId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HOUSEHOLD_KEY(userId), householdId)
    }
  } catch {
    // sin storage: la resolución por RPC sigue funcionando
  }
}

export function createCloudAdapter(url: string, anonKey: string): DataAdapter {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

  let cachedSession: { userId: string; user: SessionUser } | null = null

  /* --------------------------- Realtime (hogar) --------------------------- */

  const instanceId = `gastos-${Math.random().toString(36).slice(2, 10)}`
  let broadcastChannel: ReturnType<SupabaseClient['channel']> | null = null

  /** Señal sin datos: quien la recibe relee del servidor con su propia sesión. */
  function notifyChange(): void {
    if (!broadcastChannel) return
    void Promise.resolve(
      broadcastChannel.send({
        type: 'broadcast',
        event: 'changed',
        payload: { from: instanceId },
      }),
    ).catch(() => {})
  }

  function invalidateSession(): void {
    cachedSession = null
  }

  async function resolveSession(): Promise<SessionUser | null> {
    const { data } = await client.auth.getSession()
    const authUser = data.session?.user
    if (!authUser) {
      cachedSession = null
      return null
    }
    if (cachedSession?.userId === authUser.id) return cachedSession.user

    let householdId = readCachedHouseholdId(authUser.id)
    let householdName: string | null = null
    try {
      const result = await client.rpc('my_household')
      if (result.error) throw result.error
      const row = firstRow<HouseholdRow>(result.data)
      if (!row) throw new Error('No se pudo resolver el hogar de la cuenta.')
      householdId = row.id
      householdName = row.name
      writeCachedHouseholdId(authUser.id, row.id)
    } catch (error) {
      const online = typeof navigator === 'undefined' || navigator.onLine !== false
      if (householdId && isOfflineError(error, online)) {
        // sin conexión: seguimos con el hogar guardado en este dispositivo
      } else {
        throw migrationHint(error as { message?: string; code?: string })
      }
    }

    const user = toUser(authUser, householdId, householdName)
    if (!user) return null
    cachedSession = { userId: authUser.id, user }
    return user
  }

  async function requireHouseholdId(): Promise<string> {
    const user = await resolveSession()
    if (!user) throw new Error('Tu sesión expiró. Volvé a ingresar.')
    if (!user.householdId) {
      throw new Error('No pudimos cargar tu hogar. Conectate a internet y volvé a intentar.')
    }
    return user.householdId
  }

  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.rpc(name, args)
    if (error) throw migrationHint(error)
    return data as T
  }

  async function getHousehold(): Promise<Household | null> {
    const data = await rpc<unknown>('my_household')
    const row = firstRow<HouseholdRow>(data)
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      memberCount: Number(row.member_count ?? 0),
      baseCurrency: isCurrency(row.base_currency) ? row.base_currency : 'EUR',
    }
  }

  async function refreshAfterMembershipChange(): Promise<Household> {
    invalidateSession()
    const user = await resolveSession()
    if (user?.householdId) writeCachedHouseholdId(user.id, user.householdId)
    const household = await getHousehold()
    if (!household) throw new Error('No se pudo cargar el hogar después del cambio.')
    return household
  }

  const adapter: DataAdapter = {
    kind: 'cloud',

    async getUser() {
      return resolveSession()
    },

    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        invalidateSession()
        cb(toUser(session?.user, session?.user ? readCachedHouseholdId(session.user.id) : null))
      })
      return () => data.subscription.unsubscribe()
    },

    subscribeToChanges(onChange) {
      let cancelled = false
      let channel: ReturnType<SupabaseClient['channel']> | null = null
      void (async () => {
        try {
          const { data } = await client.auth.getSession()
          if (data.session?.access_token) client.realtime.setAuth(data.session.access_token)
          const user = await resolveSession()
          if (cancelled || !user?.householdId) return
          channel = client
            .channel(`gastos:hh:${user.householdId}`)
            .on('broadcast', { event: 'changed' }, (payload) => {
              const from = (payload.payload as { from?: unknown } | undefined)?.from
              if (!isOwnBroadcast(from, instanceId)) onChange()
            })
            .subscribe()
          broadcastChannel = channel
        } catch {
          // Realtime es una mejora: si falla, la app sigue funcionando igual.
        }
      })()
      return () => {
        cancelled = true
        if (channel) {
          if (broadcastChannel === channel) broadcastChannel = null
          void client.removeChannel(channel)
        }
      }
    },

    async signIn(email, password) {
      invalidateSession()
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw new Error(traducirAuthError(error.message))
      await resolveSession()
    },

    async signUp(email, password) {
      invalidateSession()
      const { data, error } = await client.auth.signUp({ email, password })
      if (error) throw new Error(traducirAuthError(error.message))
      if (data.session) await resolveSession()
      return { needsConfirmation: !data.session }
    },

    async signOut() {
      invalidateSession()
      const { error } = await client.auth.signOut()
      if (error) throw new Error(error.message)
    },

    async resetPassword(email) {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : undefined
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) throw new Error(traducirAuthError(error.message))
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password })
      if (error) throw new Error(traducirAuthError(error.message))
    },

    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account')
      if (error) {
        if (
          error.code === 'PGRST202' ||
          /delete_my_account/i.test(error.message) ||
          /function .* does not exist/i.test(error.message)
        ) {
          throw new Error(
            'Falta actualizar el schema de Supabase: ejecutá npm run db:push para habilitar el borrado de cuenta.',
          )
        }
        throw new Error(error.message)
      }
      invalidateSession()
      await client.auth.signOut().catch(() => {})
    },

    /* ------------------------------- Hogar ------------------------------- */

    getHousehold,

    async renameHousehold(name) {
      await rpc('household_rename', { p_name: name.trim() })
    },

    async setHouseholdBaseCurrency(code) {
      await rpc('household_set_base_currency', { p_currency: code })
      await getHousehold()
    },

    async listHouseholdMembers() {
      const data = await rpc<unknown>('household_members_list')
      return rpcRows<MemberRow>(data).map((row) => ({
        userId: row.user_id,
        email: row.email ?? '',
        role: row.role,
        joinedAt: row.joined_at,
      }))
    },

    async createHouseholdInvite() {
      const token = await rpc<string>('household_invite_create')
      const invites = await adapter.listHouseholdInvites()
      return (
        invites.find((invite) => invite.token === token) ?? {
          token,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          revokedAt: null,
          usedCount: 0,
        }
      )
    },

    async listHouseholdInvites() {
      const data = await rpc<unknown>('household_invite_list')
      return rpcRows<InviteRow>(data).map((row) => ({
        token: row.token,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at ?? null,
        usedCount: Number(row.used_count ?? 0),
      }))
    },

    async revokeHouseholdInvite(token) {
      await rpc('household_invite_revoke', { p_token: token })
    },

    async getHouseholdInviteInfo(token) {
      const data = await rpc<unknown>('household_invite_info', { p_token: token })
      const row = firstRow<InviteInfoRow>(data)
      if (!row) return null
      return {
        householdId: row.household_id,
        householdName: row.household_name,
        memberCount: Number(row.member_count ?? 0),
        expiresAt: row.expires_at,
      }
    },

    async joinHousehold(token) {
      const data = await rpc<unknown>('household_join', { p_token: token })
      const row = firstRow<JoinRow>(data)
      if (!row) throw new Error('La invitación no es válida o ya venció.')
      return refreshAfterMembershipChange()
    },

    async leaveHousehold() {
      await rpc('household_leave')
      await refreshAfterMembershipChange()
    },

    /* ------------------------------- Gastos ------------------------------- */

    async listExpenses() {
      const { data, error } = await client
        .from('expenses')
        .select('*')
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as ExpenseRow[]).map(mapExpense)
    },

    async saveExpense(expense) {
      const householdId = await requireHouseholdId()
      const { error } = await client
        .from('expenses')
        .upsert(toExpenseRow(expense, householdId), { onConflict: 'id' })
      if (error) throw new Error(error.message)
      return expense
    },

    async deleteExpense(id) {
      const { error } = await client.from('expenses').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    async clearExpenses() {
      const householdId = await requireHouseholdId()
      const { error } = await client
        .from('expenses')
        .delete()
        .eq('household_id', householdId)
      if (error) throw new Error(error.message)
    },

    async exportAll(): Promise<Snapshot> {
      const { data, error } = await client.from('expenses').select('*')
      if (error) throw new Error(error.message)
      return {
        app: 'gastos',
        version: 1,
        exportedAt: new Date().toISOString(),
        expenses: ((data ?? []) as ExpenseRow[]).map(mapExpense),
      }
    },

    async importAll(snapshot) {
      const householdId = await requireHouseholdId()
      const { error: removal } = await client
        .from('expenses')
        .delete()
        .eq('household_id', householdId)
      if (removal) throw new Error(removal.message)
      if (snapshot.expenses.length === 0) return
      const rows = snapshot.expenses.map((expense) =>
        toExpenseRow(withCurrencyDefaults({ ...expense, id: isUuid(expense.id) ? expense.id : newUuid() }), householdId),
      )
      const { error } = await client.from('expenses').insert(rows)
      if (error) throw new Error(error.message)
    },

    async wipe() {
      await adapter.clearExpenses()
    },
  }

  // Después de CUALQUIER escritura exitosa avisamos al hogar.
  const WRITES = [
    'deleteAccount', 'renameHousehold', 'setHouseholdBaseCurrency', 'createHouseholdInvite',
    'revokeHouseholdInvite', 'joinHousehold', 'leaveHousehold',
    'saveExpense', 'deleteExpense', 'clearExpenses', 'importAll', 'wipe',
  ] as const
  const mutable = adapter as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
  for (const name of WRITES) {
    const original = mutable[name].bind(adapter)
    mutable[name] = async (...args: unknown[]) => {
      const result = await original(...args)
      notifyChange()
      return result
    }
  }

  return adapter
}

function traducirAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Email o contraseña incorrectos.'
  if (lower.includes('email not confirmed')) return 'Confirmá tu email antes de ingresar.'
  if (lower.includes('user already registered')) return 'Ese email ya tiene una cuenta.'
  if (lower.includes('password should be at least')) return 'La contraseña necesita al menos 6 caracteres.'
  if (lower.includes('new password should be different')) {
    return 'La contraseña nueva tiene que ser distinta de la anterior.'
  }
  if (lower.includes('email rate limit exceeded')) {
    return 'Mandaste demasiados emails seguidos. Esperá unos minutos y probá de nuevo.'
  }
  if (lower.includes('unable to validate email')) return 'El email no parece válido.'
  return message
}
