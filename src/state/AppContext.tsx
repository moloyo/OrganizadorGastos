import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  DataAdapter,
  Expense,
  Household,
  HouseholdInvite,
  HouseholdMember,
  InviteInfo,
  OfflineStatus,
  SessionUser,
  Snapshot,
} from '../types'
import { getAdapter, cloudConfigured, makeId } from '../lib/adapters'
import { currentMonthKey, monthKey, shiftMonth } from '../lib/date'
import { sumCents, totalsByCategory } from '../lib/money'
import { shouldRefreshFromRealtime } from '../lib/realtime'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  tone: ToastTone
}

interface AppContextValue {
  ready: boolean
  loaded: boolean
  busy: boolean
  offlineStatus: OfflineStatus
  retrySync: () => void
  user: SessionUser | null
  household: Household | null
  householdMembers: HouseholdMember[]
  householdInvites: HouseholdInvite[]
  isCloud: boolean
  month: string
  goToMonth: (key: string) => void
  shiftMonth: (amount: number) => void
  expenses: Expense[]
  allExpenses: Expense[]
  totalCents: number
  totals: { category: string; cents: number }[]
  toasts: Toast[]
  toast: (message: string, tone?: ToastTone) => void
  dismissToast: (id: string) => void
  addExpense: (
    description: string,
    amountCents: number,
    category: string,
    spentOn: string,
    note?: string,
  ) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  clearExpenses: () => Promise<void>
  refreshHousehold: () => Promise<void>
  createInvite: () => Promise<HouseholdInvite>
  revokeInvite: (token: string) => Promise<void>
  renameHousehold: (name: string) => Promise<void>
  leaveHousehold: () => Promise<void>
  joinHousehold: (token: string) => Promise<Household>
  getInviteInfo: (token: string) => Promise<InviteInfo | null>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  deleteAccount: () => Promise<void>
  exportData: () => Promise<Snapshot>
  importData: (snapshot: Snapshot) => Promise<void>
  wipeData: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const adapter: DataAdapter = useMemo(() => getAdapter(), [])
  const [ready, setReady] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([])
  const [householdInvites, setHouseholdInvites] = useState<HouseholdInvite[]>([])
  const [month, setMonth] = useState(currentMonthKey)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>(
    () =>
      adapter.offline?.getStatus() ?? {
        online: true, pending: 0, syncing: false, lastError: null,
      },
  )

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = makeId()
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 3800)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const refreshHousehold = useCallback(async () => {
    const [nextHousehold, nextMembers, nextInvites] = await Promise.all([
      adapter.getHousehold(),
      adapter.listHouseholdMembers(),
      adapter.listHouseholdInvites(),
    ])
    setHousehold(nextHousehold)
    setHouseholdMembers(nextMembers)
    setHouseholdInvites(nextInvites)
  }, [adapter])

  /* ------------------------------- Sesión ------------------------------- */

  useEffect(() => {
    let alive = true
    adapter
      .getUser()
      .then((sessionUser) => {
        if (!alive) return
        setUser(sessionUser)
        setReady(true)
      })
      .catch((error: unknown) => {
        if (alive) {
          setReady(true)
          toast(
            error instanceof Error ? error.message : 'No pudimos iniciar tu sesión.',
            'error',
          )
        }
      })
    const unsubscribe = adapter.onAuthChange((sessionUser) => {
      if (!alive) return
      setUser(sessionUser)
      setReady(true)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [adapter, toast])

  useEffect(() => {
    if (!user) {
      setHousehold(null)
      setHouseholdMembers([])
      setHouseholdInvites([])
      return
    }
    void refreshHousehold().catch((error: unknown) => {
      toast(error instanceof Error ? error.message : 'No pudimos cargar tu hogar.', 'error')
    })
  }, [user?.id, user?.householdId, refreshHousehold, toast])

  /* --------------------------- Datos iniciales --------------------------- */

  const reloadAll = useCallback(async () => {
    const next = await adapter.listExpenses()
    setExpenses(next)
  }, [adapter])

  useEffect(() => {
    if (!user) {
      setExpenses([])
      setLoaded(true)
      return
    }
    let alive = true
    setBusy(true)
    setLoaded(false)
    reloadAll()
      .catch((error: unknown) => {
        toast(error instanceof Error ? error.message : 'No pudimos cargar tus gastos.', 'error')
      })
      .finally(() => {
        if (alive) { setBusy(false); setLoaded(true) }
      })
    return () => { alive = false }
  }, [user?.id, user?.householdId, reloadAll, toast])

  /* --------------------------- Offline / sincronización --------------------------- */

  const wasSyncing = useRef(false)
  const lastErrorAt = useRef(0)

  useEffect(() => {
    const support = adapter.offline
    if (!support) {
      setOfflineStatus({ online: true, pending: 0, syncing: false, lastError: null })
      return
    }
    setOfflineStatus(support.getStatus())
    return support.subscribe(setOfflineStatus)
  }, [adapter])

  useEffect(() => {
    if (wasSyncing.current && !offlineStatus.syncing && offlineStatus.pending === 0) {
      void reloadAll().catch(() => {})
    }
    wasSyncing.current = offlineStatus.syncing
    const error = offlineStatus.lastError
    if (error && error.at !== lastErrorAt.current) {
      lastErrorAt.current = error.at
      toast(`No pudimos sincronizar un cambio: ${error.message}`, 'error')
    }
  }, [offlineStatus, reloadAll, toast])

  const retrySync = useCallback(() => {
    void adapter.offline?.flush()
  }, [adapter])

  /* --------------------------- Realtime (hogar) --------------------------- */

  const offlineRef = useRef(offlineStatus)
  useEffect(() => { offlineRef.current = offlineStatus }, [offlineStatus])

  useEffect(() => {
    if (!user) return
    let timer: number | undefined
    const unsubscribe = adapter.subscribeToChanges(() => {
      if (!shouldRefreshFromRealtime(offlineRef.current)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void reloadAll().catch(() => {})
        void refreshHousehold().catch(() => {})
      }, 350)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [adapter, refreshHousehold, reloadAll, user?.id, user?.householdId])

  /* ------------------------------- Derivados ------------------------------- */

  const visibleExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => monthKey(expense.spentOn) === month)
        .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt)),
    [expenses, month],
  )

  const totalCents = useMemo(() => sumCents(visibleExpenses), [visibleExpenses])
  const totals = useMemo(() => totalsByCategory(visibleExpenses), [visibleExpenses])

  /* ------------------------------- Acciones ------------------------------- */

  const addExpense = useCallback(
    async (description: string, amountCents: number, category: string, spentOn: string, note = '') => {
      const expense: Expense = {
        id: makeId(),
        description: description.trim(),
        amountCents,
        category,
        spentOn,
        note,
        createdAt: new Date().toISOString(),
      }
      setExpenses((prev) => [expense, ...prev])
      try {
        await adapter.saveExpense(expense)
        toast('Gasto agregado.', 'success')
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos guardar el gasto.', 'error')
        await reloadAll().catch(() => {})
      }
    },
    [adapter, reloadAll, toast],
  )

  const deleteExpense = useCallback(
    async (id: string) => {
      const previous = expenses
      setExpenses((prev) => prev.filter((item) => item.id !== id))
      try {
        await adapter.deleteExpense(id)
        toast('Gasto eliminado.', 'success')
      } catch (error) {
        setExpenses(previous)
        toast(error instanceof Error ? error.message : 'No pudimos eliminar el gasto.', 'error')
      }
    },
    [adapter, expenses, toast],
  )

  const clearExpenses = useCallback(async () => {
    const previous = expenses
    setExpenses([])
    try {
      await adapter.clearExpenses()
      toast('Gastos borrados.', 'success')
    } catch (error) {
      setExpenses(previous)
      toast(error instanceof Error ? error.message : 'No pudimos borrar los gastos.', 'error')
    }
  }, [adapter, expenses, toast])

  const createInvite = useCallback(async () => {
    const invite = await adapter.createHouseholdInvite()
    await refreshHousehold()
    return invite
  }, [adapter, refreshHousehold])

  const revokeInvite = useCallback(
    async (token: string) => {
      await adapter.revokeHouseholdInvite(token)
      await refreshHousehold()
    },
    [adapter, refreshHousehold],
  )

  const renameHousehold = useCallback(
    async (name: string) => {
      await adapter.renameHousehold(name)
      await refreshHousehold()
    },
    [adapter, refreshHousehold],
  )

  const refreshAfterMembershipChange = useCallback(async () => {
    const nextUser = await adapter.getUser()
    setUser(nextUser)
    adapter.offline?.rescope?.(nextUser?.householdId ?? nextUser?.id ?? null)
    await Promise.all([reloadAll().catch(() => {}), refreshHousehold()])
  }, [adapter, refreshHousehold, reloadAll])

  const joinHousehold = useCallback(
    async (token: string) => {
      const joined = await adapter.joinHousehold(token)
      await refreshAfterMembershipChange()
      toast(`Te uniste a ${joined.name}.`, 'success')
      return joined
    },
    [adapter, refreshAfterMembershipChange, toast],
  )

  const leaveHousehold = useCallback(async () => {
    await adapter.leaveHousehold()
    await refreshAfterMembershipChange()
    toast('Saliste del hogar.', 'success')
  }, [adapter, refreshAfterMembershipChange, toast])

  const getInviteInfo = useCallback(
    (token: string) => adapter.getHouseholdInviteInfo(token),
    [adapter],
  )

  const signIn = useCallback((email: string, password: string) => adapter.signIn(email, password), [adapter])
  const signUp = useCallback((email: string, password: string) => adapter.signUp(email, password), [adapter])
  const signOut = useCallback(async () => {
    await adapter.signOut()
    setUser(null)
    setExpenses([])
  }, [adapter])
  const resetPassword = useCallback((email: string) => adapter.resetPassword(email), [adapter])
  const updatePassword = useCallback((password: string) => adapter.updatePassword(password), [adapter])
  const deleteAccount = useCallback(async () => {
    await adapter.deleteAccount()
    setUser(null)
    setExpenses([])
  }, [adapter])

  const exportData = useCallback(() => adapter.exportAll(), [adapter])
  const importData = useCallback(
    async (snapshot: Snapshot) => {
      await adapter.importAll(snapshot)
      await reloadAll()
      toast('Datos importados.', 'success')
    },
    [adapter, reloadAll, toast],
  )
  const wipeData = useCallback(async () => {
    await adapter.wipe()
    setExpenses([])
    toast('Datos borrados.', 'success')
  }, [adapter, toast])

  const value: AppContextValue = {
    ready, loaded, busy, offlineStatus, retrySync,
    user, household, householdMembers, householdInvites,
    isCloud: cloudConfigured,
    month,
    goToMonth: (key: string) => setMonth(key),
    shiftMonth: (amount: number) => setMonth((prev) => shiftMonth(prev, amount)),
    expenses: visibleExpenses,
    allExpenses: expenses,
    totalCents,
    totals,
    toasts, toast, dismissToast,
    addExpense, deleteExpense, clearExpenses,
    refreshHousehold, createInvite, revokeInvite, renameHousehold, leaveHousehold,
    joinHousehold, getInviteInfo,
    signIn, signUp, signOut, resetPassword, updatePassword, deleteAccount,
    exportData, importData, wipeData,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp debe usarse dentro de AppProvider')
  return context
}
