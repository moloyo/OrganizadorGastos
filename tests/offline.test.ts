import { describe, expect, it } from 'vitest'
import type { DataAdapter, Expense, SessionUser } from '../src/types'
import { createOfflineAdapter, isOfflineError, type StorageLike } from '../src/lib/adapters/offline'

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

function expense(id: string, amountCents: number): Expense {
  return {
    id, description: `Gasto ${id}`, amountCents, category: 'Otros',
    spentOn: '2026-11-15', note: '', createdAt: '2026-11-15T00:00:00.000Z',
  }
}

function stubAdapter(overrides: Partial<DataAdapter> = {}): DataAdapter {
  const fail = async (): Promise<never> => { throw new Error('no implementado') }
  return {
    kind: 'cloud',
    getUser: async () => null,
    onAuthChange: () => () => {},
    subscribeToChanges: () => () => {},
    signIn: fail, signUp: fail, signOut: async () => {},
    resetPassword: fail, updatePassword: fail, deleteAccount: async () => {},
    getHousehold: async () => null,
    renameHousehold: async () => {},
    listHouseholdMembers: async () => [],
    createHouseholdInvite: fail,
    listHouseholdInvites: async () => [],
    revokeHouseholdInvite: async () => {},
    getHouseholdInviteInfo: async () => null,
    joinHousehold: fail, leaveHousehold: async () => {},
    listExpenses: fail, saveExpense: fail, deleteExpense: fail,
    clearExpenses: fail, exportAll: fail, importAll: fail, wipe: fail,
    ...overrides,
  }
}

function harness(overrides: Partial<DataAdapter> = {}) {
  const storage = new MemoryStorage()
  let online = true
  let currentUser: SessionUser | null = {
    id: 'user-a', email: 'a@gastos.app', householdId: 'hogar-1',
  }
  const base = stubAdapter({ getUser: async () => currentUser, ...overrides })
  const adapter = createOfflineAdapter(base, { storage, isOnline: () => online })
  return {
    adapter, storage,
    setOnline: (value: boolean) => { online = value },
    setUser: (user: SessionUser | null) => { currentUser = user },
  }
}

describe('errores de red', () => {
  it('encola fallas de fetch y el modo sin conexión', () => {
    expect(isOfflineError(new Error('Failed to fetch'), true)).toBe(true)
    expect(isOfflineError(new Error('cualquier cosa'), false)).toBe(true)
  })

  it('no encola errores de permisos', () => {
    expect(isOfflineError(new Error('row-level security policy'), true)).toBe(false)
  })
})

describe('caché de lectura', () => {
  it('devuelve los gastos guardados cuando falla la red', async () => {
    const cached = [expense('e1', 100)]
    const { adapter, setOnline } = harness({ listExpenses: async () => cached })
    await adapter.getUser()
    expect(await adapter.listExpenses()).toEqual(cached)
    setOnline(false)
    expect(await adapter.listExpenses()).toEqual(cached)
  })

  it('sin caché y sin red avisa en vez de inventar una lista vacía', async () => {
    const { adapter, setOnline } = harness({ listExpenses: async () => { throw new Error('Failed to fetch') } })
    await adapter.getUser()
    setOnline(false)
    await expect(adapter.listExpenses()).rejects.toThrow(/Sin conexión/)
  })
})

describe('cola de escrituras', () => {
  it('guarda un gasto sin red y lo sincroniza al volver', async () => {
    const saved: Expense[] = []
    const { adapter, setOnline } = harness({
      saveExpense: async (item) => { saved.push(item); return item },
    })
    await adapter.getUser()
    setOnline(false)
    await adapter.saveExpense(expense('e1', 100))
    expect(adapter.offline?.getStatus().pending).toBe(1)
    setOnline(true)
    await adapter.offline?.flush()
    expect(saved).toEqual([expense('e1', 100)])
    expect(adapter.offline?.getStatus().pending).toBe(0)
  })

  it('compacta escrituras repetidas del mismo gasto', async () => {
    const saved: Expense[] = []
    const { adapter, setOnline } = harness({
      saveExpense: async (item) => { saved.push(item); return item },
    })
    await adapter.getUser()
    setOnline(false)
    await adapter.saveExpense(expense('e1', 100))
    await adapter.saveExpense(expense('e1', 200))
    expect(adapter.offline?.getStatus().pending).toBe(1)
    setOnline(true)
    await adapter.offline?.flush()
    expect(saved).toEqual([expense('e1', 200)])
  })

  it('separa la cola por hogar', async () => {
    const { adapter, setOnline, setUser } = harness({ saveExpense: async (item) => item })
    await adapter.getUser()
    setOnline(false)
    await adapter.saveExpense(expense('e1', 100))
    expect(adapter.offline?.getStatus().pending).toBe(1)
    setUser({ id: 'user-b', email: 'b@gastos.app', householdId: 'hogar-2' })
    await adapter.getUser()
    expect(adapter.offline?.getStatus().pending).toBe(0)
    setUser({ id: 'user-a', email: 'a@gastos.app', householdId: 'hogar-1' })
    await adapter.getUser()
    expect(adapter.offline?.getStatus().pending).toBe(1)
  })

  it('no oculta errores que no son de red', async () => {
    const { adapter } = harness({
      saveExpense: async () => { throw new Error('row-level security policy') },
    })
    await adapter.getUser()
    await expect(adapter.saveExpense(expense('e1', 100))).rejects.toThrow(/row-level security/)
    expect(adapter.offline?.getStatus().pending).toBe(0)
  })

  it('rescope cambia el ámbito de la cola', async () => {
    const { adapter, setOnline } = harness({ saveExpense: async (item) => item })
    await adapter.getUser()
    setOnline(false)
    await adapter.saveExpense(expense('e1', 100))
    adapter.offline?.rescope?.('hogar-2')
    expect(adapter.offline?.getStatus().pending).toBe(0)
    adapter.offline?.rescope?.('hogar-1')
    expect(adapter.offline?.getStatus().pending).toBe(1)
  })
})
