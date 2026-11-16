import type { CurrencyCode, Expense } from '../types'
import { baseAmountOf, DEFAULT_CURRENCY, formatMoney } from './currency'

export { formatMoney }

/** Formato con la moneda base del hogar (EUR por defecto). */
export function formatCents(cents: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  return formatMoney(cents, currency)
}

/**
 * Acepta `1234`, `1234,56`, `1234.56` y `$ 1234,56`.
 * No acepta separadores de miles en el input (se ingresan sin puntos).
 */
export function parseAmountToCents(value: string): number | null {
  const cleaned = value.trim().replace(/^\$\s*/, '').replace(/\s/g, '').replace(',', '.')
  if (!cleaned) return null
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [integer, decimals = ''] = cleaned.split('.')
  const cents = Number(integer) * 100 + Number(decimals.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null
}

export function sumCents(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => total + baseAmountOf(expense), 0)
}

export interface CategoryComparison {
  category: string
  cents: number
  /** Porcentaje del total del mes (redondeado). */
  percent: number
  previousCents: number
  /** Variación contra el mes anterior en %; null si no había gasto en ese rubro. */
  changePercent: number | null
}

/** Ranking de rubros del mes con su peso y la variación contra el mes anterior. */
export function compareCategories(
  current: { category: string; cents: number }[],
  previous: { category: string; cents: number }[],
): CategoryComparison[] {
  const total = current.reduce((sum, item) => sum + item.cents, 0)
  const previousMap = new Map(previous.map((item) => [item.category, item.cents]))
  return current.map((item) => {
    const previousCents = previousMap.get(item.category) ?? 0
    return {
      category: item.category,
      cents: item.cents,
      percent: total > 0 ? Math.round((item.cents * 100) / total) : 0,
      previousCents,
      changePercent: previousCents > 0
        ? Math.round(((item.cents - previousCents) * 100) / previousCents)
        : null,
    }
  })
}

/** Total por categoría, ordenado de mayor a menor. */
export function totalsByCategory(
  expenses: Expense[],
): { category: string; cents: number }[] {
  const map = new Map<string, number>()
  for (const expense of expenses) {
    map.set(expense.category, (map.get(expense.category) ?? 0) + baseAmountOf(expense))
  }
  return [...map.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category, 'es'))
}
