import { describe, expect, it } from 'vitest'
import type { Expense } from '../src/types'
import { formatCents, parseAmountToCents, sumCents, totalsByCategory } from '../src/lib/money'

function expense(category: string, amountCents: number): Expense {
  return {
    id: `${category}-${amountCents}`,
    description: category,
    amountCents,
    category,
    spentOn: '2026-11-15',
    note: '',
    createdAt: '2026-11-15T00:00:00.000Z',
  }
}

describe('formato de dinero', () => {
  it('formatea centavos con separador de miles y coma decimal', () => {
    expect(formatCents(0)).toBe('$ 0,00')
    expect(formatCents(5)).toBe('$ 0,05')
    expect(formatCents(18500)).toBe('$ 185,00')
    expect(formatCents(123456)).toBe('$ 1.234,56')
    expect(formatCents(-123456)).toBe('-$ 1.234,56')
  })

  it('redondea centavos sucios', () => {
    expect(formatCents(123456.7)).toBe('$ 1.234,57')
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
