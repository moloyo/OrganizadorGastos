import { describe, expect, it } from 'vitest'
import type { Expense } from '../src/types'
import {
  compareCategories, formatCents, monthlyTotals, parseAmountToCents, sumCents, totalsByCategory,
} from '../src/lib/money'

function expense(category: string, amountCents: number): Expense {
  return {
    id: `${category}-${amountCents}`,
    description: category,
    amountCents,
    category,
    spentOn: '2026-11-15',
    note: '',
    paidBy: 'ana',
    shares: { ana: 10000 },
    currency: 'EUR',
    baseAmountCents: amountCents,
    createdAt: '2026-11-15T00:00:00.000Z',
  }
}

describe('formato de dinero', () => {
  it('formatea centavos con separador de miles y coma decimal', () => {
    expect(formatCents(0)).toBe('€ 0,00')
    expect(formatCents(5)).toBe('€ 0,05')
    expect(formatCents(18500)).toBe('€ 185,00')
    expect(formatCents(123456)).toBe('€ 1.234,56')
    expect(formatCents(-123456)).toBe('-€ 1.234,56')
    expect(formatCents(123456, 'USD')).toBe('US$ 1.234,56')
    expect(formatCents(123456, 'ARS')).toBe('$ 1.234,56')
  })

  it('redondea centavos sucios', () => {
    expect(formatCents(123456.7)).toBe('€ 1.234,57')
  })
})

describe('parseo de monto', () => {
  it('acepta enteros, coma y punto decimal', () => {
    expect(parseAmountToCents('1250')).toBe(125000)
    expect(parseAmountToCents('1250,50')).toBe(125050)
    expect(parseAmountToCents('1250.5')).toBe(125050)
    expect(parseAmountToCents('$ 1250,50')).toBe(125050)
  })

  it('rechaza valores inválidos', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('-10')).toBeNull()
    expect(parseAmountToCents('12,345')).toBeNull()
    expect(parseAmountToCents('1.2.3')).toBeNull()
  })
})

describe('totales', () => {
  it('suma todos los gastos', () => {
    expect(sumCents([expense('A', 100), expense('B', 250)])).toBe(350)
    expect(sumCents([])).toBe(0)
  })

  it('calcula totales de los últimos meses incluyendo los vacíos', () => {
    const expenses = [
      expense('A', 1000),
      { ...expense('B', 500), spentOn: '2026-09-10' },
    ]
    expect(monthlyTotals(expenses, '2026-11', 3)).toEqual([
      { month: '2026-09', cents: 500 },
      { month: '2026-10', cents: 0 },
      { month: '2026-11', cents: 1000 },
    ])
  })

  it('compara rubros con el mes anterior y calcula su peso', () => {
    const result = compareCategories(
      [{ category: 'Vacaciones', cents: 6000 }, { category: 'Compras', cents: 2000 }, { category: 'Hogar', cents: 2000 }],
      [{ category: 'Vacaciones', cents: 4000 }, { category: 'Compras', cents: 0 }],
    )
    expect(result).toEqual([
      { category: 'Vacaciones', cents: 6000, percent: 60, previousCents: 4000, changePercent: 50 },
      { category: 'Compras', cents: 2000, percent: 20, previousCents: 0, changePercent: null },
      { category: 'Hogar', cents: 2000, percent: 20, previousCents: 0, changePercent: null },
    ])
  })

  it('agrupa por rubro de mayor a menor', () => {
    const result = totalsByCategory([
      expense('Hogar', 300), expense('Salud', 100), expense('Hogar', 200),
    ])
    expect(result).toEqual([
      { category: 'Hogar', cents: 500 },
      { category: 'Salud', cents: 100 },
    ])
  })
})
