import { isCurrency, withCurrencyDefaults } from '../currency'
import type {
  CurrencyCode,
  DataAdapter,
  Expense,
  Household,
  HouseholdInvite,
  HouseholdMember,
  InviteInfo,
  SessionUser,
  Snapshot,
  Transfer,
  Trip,
} from '../../types'

const DB_KEY = 'gastos:db:v1'

const LOCAL_USER: SessionUser = {
  id: 'local',
  email: 'local@gastos.app',
  name: 'Vos',
  householdId: 'hogar-local',
  householdName: 'Hogar de prueba',
}

interface LocalDB {
  expenses: Expense[]
  householdName: string
  baseCurrency: CurrencyCode
  transfers: Transfer[]
  trips: Trip[]
}

const SEED_EXPENSES: Expense[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    description: 'Verdulería',
    amountCents: 18500,
    category: 'Alimentación',
    spentOn: '2026-11-14',
    note: '',
    paidBy: LOCAL_USER.id,
    shares: { [LOCAL_USER.id]: 10000 },
    currency: 'EUR',
    baseAmountCents: 18500,
    recurrence: 'none',
    createdAt: '2026-11-14T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    description: 'Subte',
    amountCents: 75700,
    category: 'Transporte',
    spentOn: '2026-11-13',
    note: 'Carga de SUBE',
    paidBy: LOCAL_USER.id,
    shares: { [LOCAL_USER.id]: 10000 },
    currency: 'EUR',
    baseAmountCents: 75700,
    recurrence: 'none',
    createdAt: '2026-11-13T10:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    description: 'Farmacia',
    amountCents: 12300,
    category: 'Salud',
    spentOn: '2026-11-10',
    note: '',
    paidBy: LOCAL_USER.id,
    shares: { [LOCAL_USER.id]: 10000 },
    currency: 'EUR',
    baseAmountCents: 12300,
    recurrence: 'none',
    createdAt: '2026-11-10T10:00:00.000Z',
  },
]

/** Los datos guardados antes de tener pagador/reparto/moneda se completan al leerlos. */
function withPayerAndShares(expense: Expense, base: CurrencyCode): Expense {
  return withCurrencyDefaults({
    ...expense,
    paidBy: expense.paidBy ?? LOCAL_USER.id,
    shares: expense.shares ?? { [LOCAL_USER.id]: 10000 },
    recurrence: expense.recurrence ?? 'none',
  }, base)
}

function read(): LocalDB {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDB
      if (parsed && Array.isArray(parsed.expenses)) {
        const base = isCurrency(parsed.baseCurrency) ? parsed.baseCurrency : 'EUR'
        return {
          ...parsed,
          baseCurrency: base,
          expenses: parsed.expenses.map((expense) => withPayerAndShares(expense, base)),
          transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
          trips: Array.isArray(parsed.trips) ? parsed.trips : [],
        }
      }
    }
  } catch {
    // datos corruptos: arrancamos de cero
  }
  const fresh: LocalDB = {
    expenses: SEED_EXPENSES.map((expense) => ({ ...expense })),
    householdName: 'Hogar de prueba',
    baseCurrency: 'EUR',
    transfers: [],
    trips: [],
  }
  write(fresh)
  return fresh
}

function write(db: LocalDB): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // sin storage: la app sigue en memoria
  }
}

const household: Household = {
  id: 'hogar-local',
  name: 'Hogar de prueba',
  role: 'owner',
  memberCount: 1,
  baseCurrency: 'EUR',
}

const members: HouseholdMember[] = [
  {
    userId: LOCAL_USER.id,
    email: LOCAL_USER.email,
    name: 'Vos',
    role: 'owner',
    joinedAt: '2026-11-01T00:00:00.000Z',
  },
]

export function createLocalAdapter(): DataAdapter {
  return {
    kind: 'local',

    async getUser() {
      return LOCAL_USER
    },

    onAuthChange() {
      return () => {}
    },

    subscribeToChanges() {
      // En modo local (solo tests) no hay Realtime.
      return () => {}
    },

    async signIn() {
      throw new Error('Estás en modo local. Configurá Supabase para usar cuentas.')
    },
    async signUp(_email, _password, _name) {
      throw new Error('Estás en modo local. Configurá Supabase para usar cuentas.')
    },
    async signOut() {},
    async resetPassword() {
      throw new Error('Estás en modo local. Configurá Supabase para recuperar contraseñas.')
    },
    async updatePassword() {
      throw new Error('Estás en modo local. Configurá Supabase para cambiar contraseñas.')
    },
    async deleteAccount() {
      throw new Error('Estás en modo local. No hay cuenta que eliminar.')
    },

    async getHousehold() {
      const db = read()
      return { ...household, name: db.householdName, baseCurrency: db.baseCurrency }
    },
    async renameHousehold(name) {
      const db = read()
      db.householdName = name
      write(db)
    },
    async setHouseholdBaseCurrency(code) {
      const db = read()
      db.baseCurrency = code
      write(db)
    },
    async setDisplayName() {},
    async listHouseholdMembers() {
      return members
    },
    async createHouseholdInvite(): Promise<HouseholdInvite> {
      throw new Error('Las invitaciones solo existen en la nube.')
    },
    async listHouseholdInvites(): Promise<HouseholdInvite[]> {
      return []
    },
    async revokeHouseholdInvite() {
      throw new Error('Las invitaciones solo existen en la nube.')
    },
    async getHouseholdInviteInfo(): Promise<InviteInfo | null> {
      return null
    },
    async joinHousehold(): Promise<Household> {
      const db = read()
      return { ...household, name: db.householdName, baseCurrency: db.baseCurrency }
    },
    async leaveHousehold() {
      throw new Error('Los hogares solo existen en la nube.')
    },

    async listExpenses() {
      return read().expenses
    },
    async saveExpense(expense) {
      const db = read()
      const index = db.expenses.findIndex((item) => item.id === expense.id)
      if (index >= 0) db.expenses[index] = expense
      else db.expenses.unshift(expense)
      write(db)
      return expense
    },
    async saveExpenses(expenses) {
      if (expenses.length === 0) return
      const db = read()
      db.expenses = [...expenses, ...db.expenses]
      write(db)
    },
    async deleteExpense(id) {
      const db = read()
      db.expenses = db.expenses.filter((item) => item.id !== id)
      write(db)
    },
    async clearExpenses() {
      const db = read()
      db.expenses = []
      write(db)
    },

    async listTransfers() {
      return read().transfers
    },
    async addTransfer(transfer) {
      const db = read()
      db.transfers.unshift(transfer)
      write(db)
    },
    async deleteTransfer(id) {
      const db = read()
      db.transfers = db.transfers.filter((item) => item.id !== id)
      write(db)
    },

    async listTrips() {
      return read().trips
    },
    async createTrip(trip) {
      const db = read()
      db.trips.unshift(trip)
      write(db)
    },
    async deleteTrip(id) {
      const db = read()
      db.trips = db.trips.filter((item) => item.id !== id)
      db.expenses = db.expenses.map((expense) =>
        expense.tripId === id ? { ...expense, tripId: null } : expense)
      db.transfers = db.transfers.map((transfer) =>
        transfer.tripId === id ? { ...transfer, tripId: null } : transfer)
      write(db)
    },

    async exportAll(): Promise<Snapshot> {
      return {
        app: 'gastos',
        version: 1,
        exportedAt: new Date().toISOString(),
        expenses: read().expenses,
      }
    },
    async importAll(snapshot) {
      const db = read()
      write({
        expenses: snapshot.expenses.map((expense) => withPayerAndShares(expense, db.baseCurrency)),
        householdName: db.householdName,
        baseCurrency: db.baseCurrency,
        transfers: db.transfers,
        trips: db.trips,
      })
    },
    async wipe() {
      const db = read()
      write({
        expenses: [], householdName: db.householdName, baseCurrency: db.baseCurrency,
        transfers: [], trips: db.trips,
      })
    },
  }
}
