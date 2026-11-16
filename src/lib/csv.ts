export interface CsvExpenseRow {
  description: string
  amountCents: number
  category: string
  spentOn: string
  paidBy: string | null
  currency: string | null
}

export interface CsvImportResult {
  rows: CsvExpenseRow[]
  errors: string[]
}

function detectDelimiter(text: string): ',' | ';' | '\t' {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  const counts = {
    ',': (first.match(/,/g) ?? []).length,
    ';': (first.match(/;/g) ?? []).length,
    '\t': (first.match(/\t/g) ?? []).length,
  }
  return counts[';'] > counts[','] && counts[';'] > counts['\t']
    ? ';'
    : counts['\t'] > counts[','] ? '\t' : ','
}

/** Parser mínimo con comillas dobles y delimitador detectado. */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const clean = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    if (char === '"') {
      if (quoted && clean[i + 1] === '"') { cell += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim()); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && clean[i + 1] === '\n') i += 1
      row.push(cell.trim()); cell = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
    } else {
      cell += char
    }
  }
  row.push(cell.trim())
  if (row.some((value) => value !== '')) rows.push(row)
  return rows
}

const FIELDS: Record<keyof CsvExpenseRow, string[]> = {
  description: ['description', 'descripcion', 'title', 'name', 'label', 'concepto', 'gasto', 'detalle'],
  amountCents: ['amount', 'amount_cents', 'price', 'total', 'monto', 'importe', 'value', 'cost', 'precio'],
  category: ['category', 'categoria', 'rubro', 'tag', 'type'],
  spentOn: ['date', 'fecha', 'spent_on', 'spenton', 'day', 'when'],
  paidBy: ['paid_by', 'paidby', 'payer', 'pagador', 'paid by', 'who', 'user', 'pagó', 'pago'],
  currency: ['currency', 'moneda', 'curr'],
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '_')
}

function headerIndex(header: string, aliases: string[]): number {
  const normalized = normalizeHeader(header)
  return aliases.findIndex((alias) => normalized === normalizeHeader(alias))
}

export function amountFromCsv(raw: string): number | null {
  let value = raw.trim().replace(/[^\d.,-]/g, '')
  if (!value || value === '-') return null
  const lastComma = value.lastIndexOf(',')
  const lastDot = value.lastIndexOf('.')
  if (lastComma > lastDot) value = value.replace(/\./g, '').replace(',', '.')
  else value = value.replace(/,/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return null
  const cents = Math.round(Number(value) * 100)
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null
}

export function dateFromCsv(raw: string): string | null {
  const value = raw.trim().slice(0, 10)
  let match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return null
}

/** Parsea un CSV con cabecera. Omite filas inválidas y devuelve los errores. */
export function parseExpensesCsv(text: string): CsvImportResult {
  const rows = parseCsv(text)
  if (rows.length < 2) return { rows: [], errors: ['El archivo no tiene filas de gastos.'] }
  const header = rows[0]
  const columns = {} as Record<keyof CsvExpenseRow, number>
  for (const field of Object.keys(FIELDS) as (keyof CsvExpenseRow)[]) {
    columns[field] = -1
    for (let i = 0; i < header.length; i += 1) {
      if (headerIndex(header[i], FIELDS[field]) >= 0 && columns[field] < 0) columns[field] = i
    }
  }
  if (columns.description < 0 || columns.amountCents < 0 || columns.spentOn < 0) {
    return { rows: [], errors: ['Faltan columnas: descripción, monto y fecha son obligatorias.'] }
  }

  const result: CsvExpenseRow[] = []
  const errors: string[] = []
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2
    const description = cells[columns.description]?.trim() ?? ''
    const amountCents = amountFromCsv(cells[columns.amountCents] ?? '')
    const spentOn = dateFromCsv(cells[columns.spentOn] ?? '')
    if (!description) { errors.push(`Fila ${line}: sin descripción.`); return }
    if (amountCents === null) { errors.push(`Fila ${line}: monto inválido.`); return }
    if (!spentOn) { errors.push(`Fila ${line}: fecha inválida.`); return }
    result.push({
      description,
      amountCents,
      spentOn,
      category: columns.category >= 0 ? cells[columns.category]?.trim() ?? '' : '',
      paidBy: columns.paidBy >= 0 ? cells[columns.paidBy]?.trim() || null : null,
      currency: columns.currency >= 0 ? cells[columns.currency]?.trim() || null : null,
    })
  })
  return { rows: result, errors }
}
