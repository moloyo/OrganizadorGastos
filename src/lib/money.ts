import type { Expense } from '../types'

/** `$ 1.234,56` — siempre centavos, sin coma flotante. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const integer = Math.floor(abs / 100)
  const decimals = abs % 100
  const grouped = integer.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}$ ${grouped},${decimals.toString().padStart(2, '0')}`
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
  return expenses.reduce((total, expense) => total + expense.amountCents, 0)
}

/** Total por categoría, ordenado de mayor a menor. */
export function totalsByCategory(
  expenses: Expense[],
): { category: string; cents: number }[] {
  const map = new Map<string, number>()
  for (const expense of expenses) {
    map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amountCents)
  }
  return [...map.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category, 'es'))
}
