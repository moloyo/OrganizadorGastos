import type {
  DataAdapter,
  Expense,
  OfflineStatus,
  SessionUser,
  Snapshot,
  Transfer,
  Trip,
} from '../../types'

/**
 * Envuelve al adaptador de Supabase para que la app siga funcionando sin red:
 *
 * - Caché de lectura por **hogar** (`gastos:cache:v1:<householdId>:expenses`).
 * - Cola de escrituras por hogar (`gastos:queue:v1:<householdId>`): solo se
 *   encolan errores de red; un error de RLS/validación se muestra y se descarta.
 * - `rescope` cambia el ámbito al unirse o salir de un hogar.
 */

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface OfflineOptions {
  storage?: StorageLike | null
  isOnline?: () => boolean
  now?: () => number
}

const CACHE_PREFIX = 'gastos:cache:v1'
const QUEUE_PREFIX = 'gastos:queue:v1'

type QueueOp =
  | { type: 'saveExpense'; expense: Expense }
  | { type: 'saveExpenses'; expenses: Expense[] }
  | { type: 'deleteExpense'; id: string }
  | { type: 'clearExpenses' }
  | { type: 'addTransfer'; transfer: Transfer }
  | { type: 'deleteTransfer'; id: string }
  | { type: 'createTrip'; trip: Trip }
  | { type: 'deleteTrip'; id: string }

const NETWORK_HINTS = [
  'failed to fetch', 'networkerror', 'network error', 'load failed', 'fetch failed',
  'err_internet_disconnected', 'internet connection appears to be offline',
  'the internet connection appears to be offline', 'network request failed',
  'timeout', 'timed out', 'the operation was aborted', 'aborterror',
  'service unavailable', 'bad gateway', 'gateway timeout',
]

export function isOfflineError(error: unknown, online: boolean): boolean {
  if (!online) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()
  return NETWORK_HINTS.some((hint) => lower.includes(hint))
}

function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null
    localStorage.getItem(CACHE_PREFIX)
    return localStorage
  } catch {
    return null
  }
}

function readJson<T>(storage: StorageLike | null, key: string): T | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // sin espacio o modo privado: seguimos en memoria
  }
}

/** El hogar es el ámbito natural; si falta (modo local), usamos el usuario. */
function scopeFromUser(user: SessionUser | null): string | null {
  return user?.householdId || user?.id || null
}

function compactQueue(queue: QueueOp[], op: QueueOp): QueueOp[] {
  const next = queue.filter((existing) => {
    if (op.type === 'saveExpense' && existing.type === 'saveExpense') {
      return existing.expense.id !== op.expense.id
    }
    if (op.type === 'deleteExpense' && existing.type === 'deleteExpense') {
      return existing.id !== op.id
    }
    if (op.type === 'saveExpense' && existing.type === 'deleteExpense') {
      return existing.id !== op.expense.id
    }
    if (op.type === 'deleteExpense' && existing.type === 'saveExpense') {
      return existing.expense.id !== op.id
    }
    if (op.type === 'clearExpenses' && existing.type === 'clearExpenses') return false
    return true
  })
  next.push(op)
  return next
}

export function createOfflineAdapter(
  base: DataAdapter,
  options: OfflineOptions = {},
): DataAdapter {
  const storage = options.storage === undefined ? defaultStorage() : options.storage
  const isOnline = options.isOnline ?? defaultIsOnline
  const now = options.now ?? (() => Date.now())

  const memoryQueues = new Map<string, QueueOp[]>()
  let scopeId: string | null = null
  let status: OfflineStatus = {
    online: isOnline(), pending: 0, syncing: false, lastError: null,
  }
  let flushPromise: Promise<void> | null = null
  const listeners = new Set<(next: OfflineStatus) => void>()

  const cacheKey = (uid: string, name: 'expenses') => `${CACHE_PREFIX}:${uid}:${name}`
  const queueKey = (uid: string) => `${QUEUE_PREFIX}:${uid}`
  const emit = () => listeners.forEach((listener) => listener({ ...status }))
  const patchStatus = (partial: Partial<OfflineStatus>) => {
    status = { ...status, ...partial }
    emit()
  }

  function readQueue(uid: string): QueueOp[] {
    if (!storage) return memoryQueues.get(uid) ?? []
    return readJson<QueueOp[]>(storage, queueKey(uid)) ?? []
  }

  function writeQueue(uid: string, queue: QueueOp[]): void {
    if (!storage) {
      memoryQueues.set(uid, queue)
      return
    }
    if (queue.length === 0) {
      try { storage.removeItem(queueKey(uid)) } catch { /* ignoramos */ }
      return
    }
    writeJson(storage, queueKey(uid), queue)
  }

  function enqueue(uid: string, op: QueueOp): void {
    writeQueue(uid, compactQueue(readQueue(uid), op))
    patchStatus({ pending: readQueue(uid).length })
  }

  async function ensureScope(): Promise<string | null> {
    if (scopeId) return scopeId
    const user = await base.getUser()
    scopeId = scopeFromUser(user)
    return scopeId
  }

  function cacheGet(uid: string): Expense[] | null {
    return readJson<Expense[]>(storage, cacheKey(uid, 'expenses'))
  }

  function cacheSet(uid: string, expenses: Expense[]): void {
    writeJson(storage, cacheKey(uid, 'expenses'), expenses)
  }

  function cacheClearScope(uid: string): void {
    if (!storage) return
    try {
      storage.removeItem(cacheKey(uid, 'expenses'))
    } catch { /* ignoramos */ }
  }

  function cacheUpsert(uid: string, expense: Expense): void {
    const cached = cacheGet(uid)
    if (!cached) return
    const index = cached.findIndex((item) => item.id === expense.id)
    if (index >= 0) cached[index] = expense
    else cached.unshift(expense)
    cacheSet(uid, cached)
  }

  function cacheRemove(uid: string, id: string): void {
    const cached = cacheGet(uid)
    if (cached) cacheSet(uid, cached.filter((item) => item.id !== id))
  }

  async function applyOp(op: QueueOp): Promise<void> {
    switch (op.type) {
      case 'saveExpense':
        await base.saveExpense(op.expense)
        return
      case 'deleteExpense':
        await base.deleteExpense(op.id)
        return
      case 'clearExpenses':
        await base.clearExpenses()
        return
      case 'saveExpenses':
        await base.saveExpenses(op.expenses)
        return
      case 'addTransfer':
        await base.addTransfer(op.transfer)
        return
      case 'deleteTransfer':
        await base.deleteTransfer(op.id)
        return
      case 'createTrip':
        await base.createTrip(op.trip)
        return
      case 'deleteTrip':
        await base.deleteTrip(op.id)
        return
    }
  }

  async function flush(): Promise<void> {
    if (flushPromise) return flushPromise
    const uid = scopeId
    if (!uid || !isOnline()) {
      patchStatus({ online: isOnline(), pending: uid ? readQueue(uid).length : 0 })
      return
    }
    const queue = readQueue(uid)
    if (queue.length === 0) {
      if (status.pending !== 0 || status.lastError) patchStatus({ pending: 0, lastError: null })
      return
    }

    flushPromise = (async () => {
      patchStatus({ syncing: true, online: true })
      while (true) {
        if (scopeId !== uid) break
        const current = readQueue(uid)
        const op = current[0]
        if (!op) break
        try {
          await applyOp(op)
          writeQueue(uid, current.slice(1))
          patchStatus({ pending: current.length - 1, lastError: null })
        } catch (error) {
          if (isOfflineError(error, isOnline())) {
            patchStatus({
              online: false,
              lastError: {
                message: 'Sin conexión. Los cambios quedan guardados para reintentar.',
                at: now(),
              },
            })
            break
          }
          writeQueue(uid, current.slice(1))
          patchStatus({
            pending: current.length - 1,
            lastError: {
              message: error instanceof Error ? error.message : String(error),
              at: now(),
            },
          })
        }
      }
      patchStatus({ syncing: false, online: isOnline() })
    })().finally(() => {
      flushPromise = null
      if (scopeId) patchStatus({ pending: readQueue(scopeId).length })
    })

    return flushPromise
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => patchStatus({ online: false }))
    window.addEventListener('online', () => {
      patchStatus({ online: true })
      void flush()
    })
  }

  return {
    kind: base.kind,
    offline: {
      getStatus: () => ({ ...status }),
      subscribe(cb) {
        listeners.add(cb)
        cb({ ...status })
        return () => { listeners.delete(cb) }
      },
      flush,
      rescope(nextScope) {
        scopeId = nextScope
        patchStatus({ pending: nextScope ? readQueue(nextScope).length : 0, syncing: false })
      },
    },

    async getUser() {
      const user = await base.getUser()
      scopeId = scopeFromUser(user)
      patchStatus({ pending: scopeId ? readQueue(scopeId).length : 0 })
      if (scopeId && isOnline()) void flush()
      return user
    },

    onAuthChange(cb) {
      return base.onAuthChange((user) => {
        scopeId = scopeFromUser(user)
        patchStatus({ pending: scopeId ? readQueue(scopeId).length : 0 })
        cb(user)
        if (scopeId && isOnline()) void flush()
      })
    },

    subscribeToChanges(onChange) {
      return base.subscribeToChanges(onChange)
    },

    signIn: (email, password) => base.signIn(email, password),
    signUp: (email, password, name) => base.signUp(email, password, name),
    async signOut() {
      if (scopeId && isOnline()) await flush()
      await base.signOut()
      scopeId = null
      patchStatus({ pending: 0 })
    },
    resetPassword: (email) => base.resetPassword(email),
    updatePassword: (password) => base.updatePassword(password),
    async deleteAccount() {
      const uid = scopeId
      await base.deleteAccount()
      if (uid) { cacheClearScope(uid); writeQueue(uid, []) }
      scopeId = null
      patchStatus({ pending: 0, lastError: null })
    },

    getHousehold: () => base.getHousehold(),
    renameHousehold: (name) => base.renameHousehold(name),
    setHouseholdBaseCurrency: (code) => base.setHouseholdBaseCurrency(code),
    setDisplayName: (name) => base.setDisplayName(name),
    listHouseholdMembers: () => base.listHouseholdMembers(),
    createHouseholdInvite: () => base.createHouseholdInvite(),
    listHouseholdInvites: () => base.listHouseholdInvites(),
    revokeHouseholdInvite: (token) => base.revokeHouseholdInvite(token),
    getHouseholdInviteInfo: (token) => base.getHouseholdInviteInfo(token),

    async joinHousehold(token) {
      const household = await base.joinHousehold(token)
      const user = await base.getUser()
      scopeId = scopeFromUser(user)
      patchStatus({ pending: scopeId ? readQueue(scopeId).length : 0, syncing: false })
      return household
    },

    async leaveHousehold() {
      await base.leaveHousehold()
      const user = await base.getUser()
      scopeId = scopeFromUser(user)
      patchStatus({ pending: scopeId ? readQueue(scopeId).length : 0, syncing: false })
    },

    async listExpenses() {
      const uid = await ensureScope()
      if (!isOnline()) {
        const cached = uid ? cacheGet(uid) : null
        if (cached) return cached
        throw new Error('Sin conexión y no hay datos guardados todavía. Probá de nuevo cuando tengas red.')
      }
      try {
        const expenses = await base.listExpenses()
        if (uid) cacheSet(uid, expenses)
        return expenses
      } catch (error) {
        const cached = uid ? cacheGet(uid) : null
        if (cached && isOfflineError(error, isOnline())) return cached
        throw error
      }
    },

    async saveExpense(expense) {
      const uid = await ensureScope()
      if (uid) cacheUpsert(uid, expense)
      if (!isOnline()) {
        if (!uid) throw new Error('Tu sesión expiró. Volvé a ingresar.')
        enqueue(uid, { type: 'saveExpense', expense })
        return expense
      }
      try {
        return await base.saveExpense(expense)
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'saveExpense', expense })
          return expense
        }
        if (uid) cacheClearScope(uid)
        throw error
      }
    },

    async saveExpenses(expenses) {
      if (expenses.length === 0) return
      const uid = await ensureScope()
      if (uid) for (const expense of expenses) cacheUpsert(uid, expense)
      if (!isOnline()) {
        if (!uid) throw new Error('Tu sesión expiró. Volvé a ingresar.')
        enqueue(uid, { type: 'saveExpenses', expenses })
        return
      }
      try {
        await base.saveExpenses(expenses)
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'saveExpenses', expenses })
          return
        }
        if (uid) cacheClearScope(uid)
        throw error
      }
    },

    async deleteExpense(id) {
      const uid = await ensureScope()
      if (uid) cacheRemove(uid, id)
      if (!isOnline()) {
        if (!uid) throw new Error('Tu sesión expiró. Volvé a ingresar.')
        enqueue(uid, { type: 'deleteExpense', id })
        return
      }
      try {
        await base.deleteExpense(id)
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'deleteExpense', id })
          return
        }
        if (uid) cacheClearScope(uid)
        throw error
      }
    },

    async clearExpenses() {
      const uid = await ensureScope()
      if (uid) cacheSet(uid, [])
      if (!isOnline()) {
        if (!uid) throw new Error('Tu sesión expiró. Volvé a ingresar.')
        enqueue(uid, { type: 'clearExpenses' })
        return
      }
      try {
        await base.clearExpenses()
      } catch (error) {
        if (uid && isOfflineError(error, isOnline())) {
          enqueue(uid, { type: 'clearExpenses' })
          return
        }
        if (uid) cacheClearScope(uid)
        throw error
      }
    },

    async listTransfers() {
      return base.listTransfers()
    },
    async addTransfer(transfer) {
      try { await base.addTransfer(transfer) }
      catch (error) {
        const uid = await ensureScope()
        if (uid && isOfflineError(error, isOnline())) enqueue(uid, { type: 'addTransfer', transfer })
        else throw error
      }
    },
    async deleteTransfer(id) {
      try { await base.deleteTransfer(id) }
      catch (error) {
        const uid = await ensureScope()
        if (uid && isOfflineError(error, isOnline())) enqueue(uid, { type: 'deleteTransfer', id })
        else throw error
      }
    },

    async listTrips() {
      return base.listTrips()
    },
    async createTrip(trip) {
      try { await base.createTrip(trip) }
      catch (error) {
        const uid = await ensureScope()
        if (uid && isOfflineError(error, isOnline())) enqueue(uid, { type: 'createTrip', trip })
        else throw error
      }
    },
    async deleteTrip(id) {
      try { await base.deleteTrip(id) }
      catch (error) {
        const uid = await ensureScope()
        if (uid && isOfflineError(error, isOnline())) enqueue(uid, { type: 'deleteTrip', id })
        else throw error
      }
    },

    async exportAll(): Promise<Snapshot> {
      const uid = await ensureScope()
      const cached = uid ? cacheGet(uid) : null
      if (!isOnline() && cached) {
        return {
          app: 'gastos', version: 1, exportedAt: new Date().toISOString(), expenses: cached,
        }
      }
      return base.exportAll()
    },

    async importAll(snapshot) {
      const uid = await ensureScope()
      await base.importAll(snapshot)
      if (uid) cacheSet(uid, snapshot.expenses)
    },

    async wipe() {
      const uid = await ensureScope()
      await base.wipe()
      if (uid) cacheSet(uid, [])
    },
  }
}
