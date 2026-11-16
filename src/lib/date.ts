const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** ISO local `yyyy-MM-dd`, sin corrimientos de zona. */
export function todayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** `yyyy-MM` para agrupar un mes. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function currentMonthKey(): string {
  return monthKey(todayISO())
}

export function shiftMonth(key: string, amount: number): string {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(year, month - 1 + amount, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  const name = MONTHS[month - 1] ?? ''
  return `${name} ${year}`.trim()
}

/** `15 nov` para la lista de gastos. */
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split('-').map(Number)
  return `${day} ${(MONTHS[month - 1] ?? '').slice(0, 3)}`
}

export function isCurrentMonth(iso: string): boolean {
  return monthKey(iso) === currentMonthKey()
}
