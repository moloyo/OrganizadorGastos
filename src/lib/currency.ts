import type { CurrencyCode, Expense } from '../types'

export const DEFAULT_CURRENCY: CurrencyCode = 'EUR'

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'EUR', label: 'Euro (€)', symbol: '€' },
  { code: 'ARS', label: 'Peso argentino ($)', symbol: '$' },
  { code: 'USD', label: 'Dólar (US$)', symbol: 'US$' },
]

export function isCurrency(value: unknown): value is CurrencyCode {
  return CURRENCIES.some((item) => item.code === value)
}

export function currencySymbol(code: string): string {
  return CURRENCIES.find((item) => item.code === code)?.symbol ?? code
}

/** `€ 1.234,56` — centavos, con el símbolo de la moneda. */
export function formatMoney(cents: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  const integer = Math.floor(abs / 100)
  const decimals = abs % 100
  const grouped = integer.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${currencySymbol(currency)} ${grouped},${decimals.toString().padStart(2, '0')}`
}

/** Monto convertido a la moneda base del hogar. Compatible con datos viejos. */
export function baseAmountOf(expense: Expense): number {
  return expense.baseAmountCents ?? expense.amountCents
}

/** Completa moneda y equivalente a datos guardados antes de tener estas columnas. */
export function withCurrencyDefaults(expense: Expense, base: CurrencyCode = DEFAULT_CURRENCY): Expense {
  return {
    ...expense,
    currency: isCurrency(expense.currency) ? expense.currency : base,
    baseAmountCents: baseAmountOf(expense),
  }
}
