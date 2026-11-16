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

const DB_KEY = 'gastos:db:v1'

const LOCAL_USER: SessionUser = {
  id: 'local',
  email: 'local@gastos.app',
  householdId: 'hogar-local',
  householdName: 'Hogar de prueba',
}

interface LocalDB {
  expenses: Expense[]
  householdName: string
}

const SEED_EXPENSES: Expense[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    description: 'Verdulería',
    amountCents: 18500,
    category: 'Alimentación',
    spentOn: '2026-11-14',
    note: '',
    createdAt: '2026-11-14T10:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    description: 'Subte',
    amountCents: 75700,
    category: 'Transporte',
    spentOn: '2026-11-13',
    note: 'Carga de SUBE',
    createdAt: '2026-11-13T10:00:00.000Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    description: 'Farmacia',
    amountCents: 12300,
    category: 'Salud',
    spentOn: '2026-11-10',
    note: '',
    createdAt: '2026-11-10T10:00:00.000Z',
  },
]

function read(): LocalDB {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDB
      if (parsed && Array.isArray(parsed.expenses)) return parsed
    }
  } catch {
    // datos corruptos: arrancamos de cero
  }
  const fresh: LocalDB = {
    expenses: SEED_EXPENSES.map((expense) => ({ ...expense })),
    householdName: 'Hogar de prueba',
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
}

const members: HouseholdMember[] = [
  {
    userId: LOCAL_USER.id,
    email: LOCAL_USER.email,
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
    async signUp() {
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
      return { ...household, name: read().householdName }
    },
    async renameHousehold(name) {
      const db = read()
      db.householdName = name
      write(db)
    },
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
      return { ...household, name: read().householdName }
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

    async exportAll(): Promise<Snapshot> {
      return {
        app: 'gastos',
        version: 1,
        exportedAt: new Date().toISOString(),
        expenses: read().expenses,
      }
    },
    async importAll(snapshot) {
      write({ expenses: snapshot.expenses, householdName: read().householdName })
    },
    async wipe() {
      write({ expenses: [], householdName: read().householdName })
    },
  }
}
