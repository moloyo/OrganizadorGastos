import { describe, expect, it } from 'vitest'
import type { Expense } from '../src/types'
import { formatMoney, isCurrency, withCurrencyDefaults } from '../src/lib/currency'

function oldExpense(): Expense {
  return {
    id: 'x', description: 'Viejo', amountCents: 1000, category: 'Otros',
    spentOn: '2026-11-01', note: '', paidBy: 'ana', shares: { ana: 10000 },
    createdAt: '2026-11-01T00:00:00Z',
  } as Expense
}

describe('monedas', () => {
  it('formatea con el símbolo de cada moneda', () => {
    expect(formatMoney(123456, 'EUR')).toBe('€ 1.234,56')
    expect(formatMoney(123456, 'ARS')).toBe('$ 1.234,56')
    expect(formatMoney(123456, 'USD')).toBe('US$ 1.234,56')
    expect(formatMoney(-505, 'EUR')).toBe('-€ 5,05')
  })

  it('sólo acepta las monedas soportadas', () => {
    expect(isCurrency('EUR')).toBe(true)
    expect(isCurrency('ARS')).toBe(true)
    expect(isCurrency('USD')).toBe(true)
    expect(isCurrency('XXX')).toBe(false)
    expect(isCurrency(undefined)).toBe(false)
  })

  it('completa moneda y equivalente en datos viejos', () => {
    expect(withCurrencyDefaults(oldExpense(), 'ARS')).toMatchObject({
      currency: 'ARS', baseAmountCents: 1000,
    })
  })

  it('no sobrescribe una moneda ya guardada', () => {
    const expense = { ...oldExpense(), currency: 'USD' as const, baseAmountCents: 950 }
    expect(withCurrencyDefaults(expense, 'EUR')).toMatchObject({
      currency: 'USD', baseAmountCents: 950,
    })
  })
})
