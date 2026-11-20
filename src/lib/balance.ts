/** Reparto por miembro: userId -> puntos básicos (10000 = 100 %). Debe sumar 10000. */
export type Shares = Record<string, number>

export const SHARES_TOTAL = 10000

export interface SharedExpense {
  amountCents: number
  /** Equivalente en la moneda base del hogar. Todas las métricas lo usan. */
  baseAmountCents: number
  /** ISO `yyyy-MM-dd`. */
  spentOn: string
  paidBy: string
  shares: Shares
}

export interface Settlement {
  from: string
  to: string
  cents: number
}

export interface SharedTransfer {
  from: string
  to: string
  baseAmountCents: number
  paidOn: string
}

export interface MonthSummary {
  month: string
  totalCents: number
  paidCents: Record<string, number>
  owedCents: Record<string, number>
  /** Positivo: le deben. Negativo: debe. Suma siempre 0. */
  balances: Record<string, number>
  settlements: Settlement[]
}

export function equalShares(userIds: string[]): Shares {
  if (userIds.length === 0) return {}
  const base = Math.floor(SHARES_TOTAL / userIds.length)
  const shares: Shares = {}
  userIds.forEach((id, index) => {
    shares[id] = base + (index < SHARES_TOTAL % userIds.length ? 1 : 0)
  })
  return shares
}

export function isValidShares(shares: Shares): boolean {
  const values = Object.values(shares)
  if (values.length === 0) return false
  if (!values.every((bps) => Number.isInteger(bps) && bps >= 0)) return false
  return values.reduce((total, bps) => total + bps, 0) === SHARES_TOTAL
}

/**
 * Convierte porcentajes escritos por el usuario (`"50"`, `"33,33"`) en puntos.
 * Devuelve null si algún valor no es un número con hasta 2 decimales, o si
 * el total no llega exacto a 100 %.
 */
export function sharesFromPercents(percents: Record<string, string>): Shares | null {
  const shares: Shares = {}
  for (const [id, raw] of Object.entries(percents)) {
    const value = raw.trim().replace(',', '.') || '0'
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
    shares[id] = Math.round(Number(value) * 100)
  }
  return isValidShares(shares) ? shares : null
}

/**
 * Al editar el importe de una persona, recalcula los campos "automáticos"
 * para que la suma vuelva a ser exactamente el total. Los importes que el
 * usuario escribió (locked) se respetan; si no queda ningún campo automático,
 * el resto se reparte entre los demás y ésos dejan de estar bloqueados.
 * `null` = campo vacío.
 */
export function updateAmountSplit(
  amounts: Record<string, number | null>,
  locked: Record<string, boolean>,
  editedId: string,
  editedValue: number | null,
  totalCents: number,
): { amounts: Record<string, number | null>; locked: Record<string, boolean> } {
  const next = { ...amounts, [editedId]: editedValue }
  const nextLocked = { ...locked, [editedId]: editedValue !== null }
  if (totalCents <= 0) return { amounts: next, locked: nextLocked }

  const ids = Object.keys(next)
  const others = ids.filter((id) => id !== editedId)
  const lockedOthers = others.filter((id) => nextLocked[id] && next[id] != null)
  const sumLockedOthers = lockedOthers.reduce((sum, id) => sum + (next[id] ?? 0), 0)

  if (editedValue !== null) {
    next[editedId] = Math.min(editedValue, Math.max(0, totalCents - sumLockedOthers))
  }

  const sumLocked = ids.reduce(
    (sum, id) => sum + (nextLocked[id] && next[id] != null ? next[id]! : 0), 0,
  )
  const autoIds = ids.filter((id) => !nextLocked[id] || next[id] == null)
  const remainder = Math.max(0, totalCents - sumLocked)

  if (autoIds.length > 0) {
    const parts = allocateByWeights(
      remainder, Object.fromEntries(autoIds.map((id) => [id, 1])), autoIds.length,
    )
    for (const id of autoIds) next[id] = parts[id] ?? 0
  } else if (remainder > 0 && others.length > 0) {
    // Los demás se recalculan desde cero: el resto es sólo lo que sobra
    // después del importe editado, no después de sus valores anteriores.
    const parts = allocateByWeights(
      Math.max(0, totalCents - (next[editedId] ?? 0)),
      Object.fromEntries(others.map((id) => [id, 1])),
      others.length,
    )
    for (const id of others) {
      next[id] = parts[id] ?? 0
      nextLocked[id] = false
    }
  }
  return { amounts: next, locked: nextLocked }
}

/** Reajusta los campos automáticos cuando cambia el total del gasto. */
export function rebalanceAmounts(
  amounts: Record<string, number | null>,
  locked: Record<string, boolean>,
  totalCents: number,
): Record<string, number | null> {
  const ids = Object.keys(amounts)
  if (ids.length === 0 || totalCents <= 0) return { ...amounts }
  const sumLocked = ids.reduce(
    (sum, id) => sum + (locked[id] && amounts[id] != null ? amounts[id]! : 0), 0,
  )
  const autoIds = ids.filter((id) => !locked[id] || amounts[id] == null)
  const next = { ...amounts }
  if (autoIds.length === 0) return next
  const parts = allocateByWeights(
    Math.max(0, totalCents - sumLocked),
    Object.fromEntries(autoIds.map((id) => [id, 1])),
    autoIds.length,
  )
  for (const id of autoIds) next[id] = parts[id] ?? 0
  return next
}

/** Partes enteras no negativas, con al menos una mayor que cero. */
export type Parts = Record<string, number>

export function isValidParts(parts: Parts): boolean {
  const values = Object.values(parts)
  return values.length > 0
    && values.every((value) => Number.isInteger(value) && value >= 0)
    && values.some((value) => value > 0)
}

/** Convierte partes (`2 : 1`) en puntos básicos (`6667 : 3333`), sin perder ninguno. */
export function sharesFromParts(parts: Parts): Shares | null {
  if (!isValidParts(parts)) return null
  const totalParts = Object.values(parts).reduce((sum, value) => sum + value, 0)
  return allocateByWeights(SHARES_TOTAL, parts, totalParts)
}

/**
 * Convierte importes ingresados (base currency, null o 0 = sin ingresar) en
 * puntos básicos. El importe de cada persona es su parte de la deuda del
 * gasto; el resto de la deuda se reparte igual entre quienes no pusieron
 * importe. Si todos entraron y la suma queda menor al total, el resto se
 * reparte igual entre los que entraron.
 */
export function sharesFromAmounts(
  amounts: Record<string, number | null>,
  totalCents: number,
): Shares | null {
  if (totalCents <= 0) return null
  const owed: Record<string, number> = {}
  const blanks: string[] = []
  let sumEntered = 0
  for (const [id, value] of Object.entries(amounts)) {
    if (value == null || value <= 0) { blanks.push(id); continue }
    if (!Number.isInteger(value)) return null
    owed[id] = value
    sumEntered += value
  }
  if (sumEntered > totalCents) return null
  const remainder = totalCents - sumEntered
  if (remainder > 0) {
    const recipients = blanks.length > 0 ? blanks : Object.keys(owed)
    if (recipients.length === 0) return null
    const extra = allocateByWeights(
      remainder,
      Object.fromEntries(recipients.map((id) => [id, 1])),
      recipients.length,
    )
    for (const [id, cents] of Object.entries(extra)) owed[id] = (owed[id] ?? 0) + cents
  }
  return allocateByWeights(SHARES_TOTAL, owed, totalCents)
}

/**
 * Convierte puntos básicos en partes enteras. Busca una fracción simple
 * (hasta 12 partes) que reproduzca los porcentajes con error de 1 punto
 * básico como máximo: 6667/3333 -> 2/1, en vez de 6667/3333.
 */
export function partsFromShares(shares: Shares): Parts {
  const ids = Object.keys(shares)
  if (ids.length === 0) return {}
  const positive = ids.filter((id) => shares[id] > 0)
  if (positive.length === 0) return {}

  const withZeros = (parts: Parts): Parts => {
    for (const id of ids) if (shares[id] === 0) parts[id] = 0
    return parts
  }

  for (let denominator = 1; denominator <= 12; denominator += 1) {
    const parts: Parts = {}
    let sum = 0
    let fits = true
    for (const id of positive) {
      const value = Math.round((shares[id] * denominator) / SHARES_TOTAL)
      parts[id] = value
      sum += value
      if (Math.abs((value * SHARES_TOTAL) / denominator - shares[id]) > 1) fits = false
    }
    if (fits && sum === denominator) return withZeros(parts)
  }

  const divisor = positive.map((id) => shares[id]).reduce(gcd)
  const parts: Parts = {}
  for (const id of positive) parts[id] = shares[id] / divisor
  return withZeros(parts)
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Reparte `total` según pesos y un denominador sin perder ni inventar unidades.
 * Cada parte recibe su piso; el sobrante va a los mayores restos (empate: id).
 */
function allocateByWeights(
  total: number,
  weights: Record<string, number>,
  denominator: number,
): Record<string, number> {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0).sort()
  const parts = ids.map((id) => {
    const exact = total * weights[id]
    return { id, floor: Math.floor(exact / denominator), rest: exact % denominator }
  })
  let leftover = total - parts.reduce((sum, part) => sum + part.floor, 0)
  const byRest = [...parts].sort((a, b) => b.rest - a.rest)
  for (const part of byRest) {
    if (leftover <= 0) break
    part.floor += 1
    leftover -= 1
  }
  const result: Record<string, number> = {}
  for (const part of parts) result[part.id] = part.floor
  return result
}

/**
 * Reparte `amountCents` según `shares` sin perder ni inventar centavos.
 */
export function allocateCents(amountCents: number, shares: Shares): Record<string, number> {
  return allocateByWeights(amountCents, shares, SHARES_TOTAL)
}

/** `yyyy-MM` de una fecha ISO `yyyy-MM-dd`. */
export function monthOf(spentOn: string): string {
  return spentOn.slice(0, 7)
}

/**
 * Liquidación mínima: el mínimo de transferencias que deja a todos en cero.
 * Greedy: el mayor deudor paga al mayor acreedor, hasta que uno quede en cero.
 */
export function settle(balances: Record<string, number>): Settlement[] {
  const creditors = Object.entries(balances)
    .filter(([, cents]) => cents > 0)
    .map(([id, cents]) => ({ id, cents }))
  const debtors = Object.entries(balances)
    .filter(([, cents]) => cents < 0)
    .map(([id, cents]) => ({ id, cents: -cents }))
  const byAmount = (a: { id: string; cents: number }, b: { id: string; cents: number }) =>
    b.cents - a.cents || a.id.localeCompare(b.id)
  creditors.sort(byAmount)
  debtors.sort(byAmount)

  const settlements: Settlement[] = []
  let i = 0
  let j = 0
  while (i < creditors.length && j < debtors.length) {
    const cents = Math.min(creditors[i].cents, debtors[j].cents)
    settlements.push({ from: debtors[j].id, to: creditors[i].id, cents })
    creditors[i].cents -= cents
    debtors[j].cents -= cents
    if (creditors[i].cents === 0) i += 1
    if (debtors[j].cents === 0) j += 1
  }
  return settlements
}

/** Saldo neto por persona: lo que pagó menos lo que le corresponde. */
export function computeBalances(
  expenses: SharedExpense[],
  memberIds: string[] = [],
  transfers: SharedTransfer[] = [],
): { paidCents: Record<string, number>; owedCents: Record<string, number>; balances: Record<string, number> } {
  const paidCents: Record<string, number> = {}
  const owedCents: Record<string, number> = {}
  for (const id of memberIds) {
    paidCents[id] = 0
    owedCents[id] = 0
  }
  for (const expense of expenses) {
    paidCents[expense.paidBy] = (paidCents[expense.paidBy] ?? 0) + expense.baseAmountCents
    const parts = allocateCents(expense.baseAmountCents, expense.shares)
    for (const [id, cents] of Object.entries(parts)) {
      owedCents[id] = (owedCents[id] ?? 0) + cents
    }
  }
  const ids = new Set([...Object.keys(paidCents), ...Object.keys(owedCents)])
  const balances: Record<string, number> = {}
  for (const id of ids) {
    balances[id] = (paidCents[id] ?? 0) - (owedCents[id] ?? 0)
  }
  for (const transfer of transfers) {
    balances[transfer.from] = (balances[transfer.from] ?? 0) + transfer.baseAmountCents
    balances[transfer.to] = (balances[transfer.to] ?? 0) - transfer.baseAmountCents
  }
  return { paidCents, owedCents, balances }
}

export interface CategorySplit {
  category: string
  totalCents: number
  /** Lo que le corresponde a cada persona de este rubro. Suma `totalCents`. */
  owedCents: Record<string, number>
}

/** Cómo se reparte cada rubro del mes entre las personas, de mayor a menor. */
export function splitByCategory(
  expenses: (SharedExpense & { category: string })[],
  month: string,
): CategorySplit[] {
  const map = new Map<string, CategorySplit>()
  for (const expense of expenses) {
    if (monthOf(expense.spentOn) !== month) continue
    const row = map.get(expense.category) ?? { category: expense.category, totalCents: 0, owedCents: {} }
    row.totalCents += expense.baseAmountCents
    for (const [id, cents] of Object.entries(allocateCents(expense.baseAmountCents, expense.shares))) {
      row.owedCents[id] = (row.owedCents[id] ?? 0) + cents
    }
    map.set(expense.category, row)
  }
  return [...map.values()].sort(
    (a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category, 'es'),
  )
}

/** Saldo acumulado desde el principio: todos los gastos y todos los pagos. */
export function overallSummary(
  expenses: SharedExpense[],
  memberIds: string[] = [],
  transfers: SharedTransfer[] = [],
): MonthSummary {
  const { paidCents, owedCents, balances } = computeBalances(expenses, memberIds, transfers)
  return {
    month: '',
    totalCents: expenses.reduce((total, expense) => total + expense.baseAmountCents, 0),
    paidCents,
    owedCents,
    balances,
    settlements: settle(balances),
  }
}

/** Resumen de un mes: total, saldos y liquidación para dejar todo a mano. */
export function monthSummary(
  expenses: SharedExpense[],
  month: string,
  memberIds: string[] = [],
  transfers: SharedTransfer[] = [],
): MonthSummary {
  const inMonth = expenses.filter((expense) => monthOf(expense.spentOn) === month)
  const transfersInMonth = transfers.filter((transfer) => monthOf(transfer.paidOn) === month)
  const { paidCents, owedCents, balances } = computeBalances(inMonth, memberIds, transfersInMonth)
  return {
    month,
    totalCents: inMonth.reduce((total, expense) => total + expense.baseAmountCents, 0),
    paidCents,
    owedCents,
    balances,
    settlements: settle(balances),
  }
}
