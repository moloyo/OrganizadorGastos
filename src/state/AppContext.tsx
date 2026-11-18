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
  CurrencyCode,
  DataAdapter,
  Expense,
  Household,
  HouseholdInvite,
  HouseholdMember,
  InviteInfo,
  OfflineStatus,
  Recurrence,
  SessionUser,
  Snapshot,
  Transfer,
  Trip,
} from '../types'
import { getAdapter, cloudConfigured, makeId } from '../lib/adapters'
import { isCurrency } from '../lib/currency'
import { normalizeCategory } from '../lib/constants'
import { equalShares } from '../lib/balance'
import { addMonthsToISO, currentMonthKey, monthKey, shiftMonth } from '../lib/date'
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
  baseCurrency: CurrencyCode
  setBaseCurrency: (code: CurrencyCode) => Promise<void>
  setDisplayName: (name: string) => Promise<void>
  householdMembers: HouseholdMember[]
  householdInvites: HouseholdInvite[]
  trips: Trip[]
  activeTripId: string | null
  setActiveTrip: (id: string | null) => void
  createTrip: (trip: Trip) => Promise<void>
  deleteTrip: (id: string) => Promise<void>
  transfers: Transfer[]
  addTransfer: (transfer: Transfer) => Promise<void>
  deleteTransfer: (id: string) => Promise<void>
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
  addExpense: (input: NewExpenseInput) => Promise<void>
  updateExpense: (id: string, input: NewExpenseInput) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  clearExpenses: () => Promise<void>
  importCsvRows: (rows: {
    description: string; amountCents: number; category: string;
    spentOn: string; paidBy: string | null; currency: string | null
  }[]) => Promise<number>
  refreshHousehold: () => Promise<void>
  createInvite: () => Promise<HouseholdInvite>
  revokeInvite: (token: string) => Promise<void>
  renameHousehold: (name: string) => Promise<void>
  leaveHousehold: () => Promise<void>
  joinHousehold: (token: string) => Promise<Household>
  getInviteInfo: (token: string) => Promise<InviteInfo | null>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  deleteAccount: () => Promise<void>
  exportData: () => Promise<Snapshot>
  importData: (snapshot: Snapshot) => Promise<void>
  wipeData: () => Promise<void>
}

export interface NewExpenseInput {
  description: string
  amountCents: number
  category: string
  spentOn: string
  note?: string
  paidBy: string
  shares: Expense['shares']
  currency: CurrencyCode
  baseAmountCents: number
  recurrence: Recurrence
}

function resolveImportedPayer(
  raw: string | null,
  members: HouseholdMember[],
  currentUserId?: string,
): string {
  if (!raw) return currentUserId ?? ''
  const value = raw.trim().toLowerCase()
  const match = members.find((member) =>
    member.email.toLowerCase() === value || member.userId.toLowerCase() === value)
  return match?.userId ?? currentUserId ?? ''
}

const isCurrencyCode = isCurrency

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
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
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
    // getHousehold crea el hogar si falta (ensure_household). Las otras RPC
    // asumen que ya existe, así que van después: en paralelo hay carrera con
    // cuentas nuevas que todavía no tienen hogar.
    const nextHousehold = await adapter.getHousehold()
    const [nextMembers, nextInvites] = await Promise.all([
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
    const [nextExpenses, nextTransfers, nextTrips] = await Promise.all([
      adapter.listExpenses(),
      adapter.listTransfers(),
      adapter.listTrips(),
    ])
    setExpenses(nextExpenses)
    setTransfers(nextTransfers)
    setTrips(nextTrips)
  }, [adapter])

  useEffect(() => {
    if (!user) {
      setExpenses([])
      setTransfers([])
      setTrips([])
      setActiveTripId(null)
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

  const scopedExpenses = useMemo(
    () => expenses.filter((expense) => (expense.tripId ?? null) === activeTripId),
    [expenses, activeTripId],
  )
  const scopedTransfers = useMemo(
    () => transfers.filter((transfer) => (transfer.tripId ?? null) === activeTripId),
    [transfers, activeTripId],
  )
  const activeTrip = trips.find((trip) => trip.id === activeTripId) ?? null
  const baseCurrency: CurrencyCode = activeTrip?.baseCurrency ?? household?.baseCurrency ?? 'EUR'

  useEffect(() => {
    if (activeTripId && trips.length > 0 && !trips.some((trip) => trip.id === activeTripId)) {
      setActiveTripId(null)
    }
  }, [activeTripId, trips])

  const visibleExpenses = useMemo(
    () =>
      scopedExpenses
        .filter((expense) => monthKey(expense.spentOn) === month)
        .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt)),
    [scopedExpenses, month],
  )

  const totalCents = useMemo(() => sumCents(visibleExpenses), [visibleExpenses])
  const totals = useMemo(() => totalsByCategory(visibleExpenses), [visibleExpenses])

  /* ------------------------------- Acciones ------------------------------- */

  const addExpense = useCallback(
    async ({ description, amountCents, category, spentOn, note = '', paidBy, shares, currency, baseAmountCents, recurrence }: NewExpenseInput) => {
      const groupId = recurrence === 'monthly' ? makeId() : null
      const count = recurrence === 'monthly' ? 12 : 1
      const createdAt = new Date().toISOString()
      const copies: Expense[] = Array.from({ length: count }, (_, index) => ({
        id: makeId(),
        description: description.trim(),
        amountCents,
        category,
        spentOn: index === 0 ? spentOn : addMonthsToISO(spentOn, index),
        note,
        paidBy,
        shares,
        currency,
        baseAmountCents,
        tripId: activeTripId,
        recurrence,
        recurrenceGroupId: groupId,
        createdAt,
      }))
      setExpenses((prev) => [...copies, ...prev])
      try {
        if (copies.length === 1) await adapter.saveExpense(copies[0])
        else await adapter.saveExpenses(copies)
        toast(count > 1 ? `Gasto agregado y repetido ${count} meses.` : 'Gasto agregado.', 'success')
      } catch (error) {
        toast(error instanceof Error ? error.message : 'No pudimos guardar el gasto.', 'error')
        await reloadAll().catch(() => {})
      }
    },
    [adapter, activeTripId, reloadAll, toast],
  )

  const updateExpense = useCallback(
    async (id: string, input: NewExpenseInput) => {
      const previous = expenses
      const original = previous.find((item) => item.id === id)
      const updated: Expense = {
        ...(original ?? { id, createdAt: new Date().toISOString(), recurrence: input.recurrence as Recurrence }),
        description: input.description.trim(),
        amountCents: input.amountCents,
        category: input.category,
        spentOn: input.spentOn,
        note: input.note ?? '',
        paidBy: input.paidBy,
        shares: input.shares,
        currency: input.currency,
        baseAmountCents: input.baseAmountCents,
      }
      setExpenses((prev) => prev.map((item) => (item.id === id ? updated : item)))
      try {
        await adapter.saveExpense(updated)
        toast('Gasto actualizado.', 'success')
      } catch (error) {
        setExpenses(previous)
        toast(error instanceof Error ? error.message : 'No pudimos actualizar el gasto.', 'error')
        await reloadAll().catch(() => {})
      }
    },
    [adapter, expenses, reloadAll, toast],
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

  const setBaseCurrency = useCallback(
    async (code: CurrencyCode) => {
      await adapter.setHouseholdBaseCurrency(code)
      await refreshHousehold()
    },
    [adapter, refreshHousehold],
  )

  const addTransfer = useCallback(
    async (transfer: Transfer) => {
      setTransfers((prev) => [transfer, ...prev])
      try {
        await adapter.addTransfer(transfer)
        toast('Pago registrado.', 'success')
      } catch (error) {
        setTransfers((prev) => prev.filter((item) => item.id !== transfer.id))
        toast(error instanceof Error ? error.message : 'No pudimos registrar el pago.', 'error')
        await reloadAll().catch(() => {})
      }
    },
    [adapter, reloadAll, toast],
  )

  const deleteTransfer = useCallback(
    async (id: string) => {
      const previous = transfers
      setTransfers((prev) => prev.filter((item) => item.id !== id))
      try { await adapter.deleteTransfer(id); toast('Pago eliminado.', 'success') }
      catch (error) {
        setTransfers(previous)
        toast(error instanceof Error ? error.message : 'No pudimos eliminar el pago.', 'error')
      }
    },
    [adapter, transfers, toast],
  )

  const setDisplayName = useCallback(
    async (name: string) => {
      await adapter.setDisplayName(name)
      setUser((prev) => (prev ? { ...prev, name } : prev))
      await refreshHousehold()
    },
    [adapter, refreshHousehold],
  )

  const createTrip = useCallback(
    async (trip: Trip) => {
      await adapter.createTrip(trip)
      await reloadAll()
      toast(`Viaje ${trip.name} creado.`, 'success')
    },
    [adapter, reloadAll, toast],
  )

  const deleteTrip = useCallback(
    async (id: string) => {
      await adapter.deleteTrip(id)
      if (activeTripId === id) setActiveTripId(null)
      await reloadAll()
      toast('Viaje eliminado. Sus gastos volvieron al hogar.', 'success')
    },
    [adapter, activeTripId, reloadAll, toast],
  )

  const importCsvRows = useCallback(
    async (rows: {
      description: string; amountCents: number; category: string;
      spentOn: string; paidBy: string | null; currency: string | null
    }[]) => {
      if (rows.length === 0) return 0
      const imported = rows.map<Expense>((row) => {
        const currency: CurrencyCode = isCurrencyCode(row.currency) ? row.currency : baseCurrency
        const cents = row.amountCents
        return {
          id: makeId(),
          description: row.description,
          amountCents: cents,
          baseAmountCents: cents,
          currency,
          category: normalizeCategory(row.category),
          spentOn: row.spentOn,
          note: '',
          paidBy: resolveImportedPayer(row.paidBy, householdMembers, user?.id),
          shares: equalShares(householdMembers.length > 0
            ? householdMembers.map((member) => member.userId)
            : user ? [user.id] : []),
          tripId: activeTripId,
          recurrence: 'none',
          createdAt: new Date().toISOString(),
        }
      })
      setExpenses((prev) => [...imported, ...prev])
      try {
        await adapter.saveExpenses(imported)
        toast(`Importados ${imported.length} gastos.`, 'success')
        return imported.length
      } catch (error) {
        setExpenses((prev) => prev.filter((item) => !imported.some((row) => row.id === item.id)))
        toast(error instanceof Error ? error.message : 'No pudimos importar los gastos.', 'error')
        return 0
      }
    },
    [adapter, activeTripId, baseCurrency, householdMembers, toast, user?.id],
  )

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
  const signUp = useCallback((email: string, password: string, name: string) => adapter.signUp(email, password, name), [adapter])
  const signOut = useCallback(async () => {
    await adapter.signOut()
    setUser(null)
    setExpenses([])
    setTransfers([])
    setTrips([])
    setActiveTripId(null)
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
    user, household,
    baseCurrency,
    setBaseCurrency, setDisplayName,
    householdMembers, householdInvites,
    trips, activeTripId, setActiveTrip: setActiveTripId,
    createTrip, deleteTrip,
    transfers, addTransfer, deleteTransfer,
    isCloud: cloudConfigured,
    month,
    goToMonth: (key: string) => setMonth(key),
    shiftMonth: (amount: number) => setMonth((prev) => shiftMonth(prev, amount)),
    expenses: visibleExpenses,
    allExpenses: scopedExpenses,
    totalCents,
    totals,
    toasts, toast, dismissToast,
    addExpense, updateExpense, deleteExpense, clearExpenses, importCsvRows,
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
