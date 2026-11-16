import type { Expense } from '../types'

/** Minúsculas, sin acentos ni espacios repetidos: "Verdulería " == "verduleria". */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export interface DescriptionSuggestion {
  description: string
  category: string
}

/** Descripciones de gastos anteriores que contienen el texto escrito (la más reciente primero). */
export function suggestDescriptions(
  expenses: Expense[],
  query: string,
  limit = 5,
): DescriptionSuggestion[] {
  const needle = normalizeText(query)
  if (!needle) return []
  const seen = new Set<string>()
  const result: DescriptionSuggestion[] = []
  for (const expense of recentFirst(expenses)) {
    const key = normalizeText(expense.description)
    if (!key || seen.has(key)) continue
    seen.add(key)
    if (expense.description.trim() === query.trim() || !key.includes(needle)) continue
    result.push({ description: expense.description, category: expense.category })
    if (result.length >= limit) break
  }
  return result
}

/** Rubro del gasto más reciente con esa descripción (sin distinguir mayúsculas ni acentos). */
export function rememberedCategory(expenses: Expense[], description: string): string | null {
  const key = normalizeText(description)
  if (!key) return null
  const match = recentFirst(expenses).find((expense) => normalizeText(expense.description) === key)
  return match?.category ?? null
}

function recentFirst(expenses: Expense[]): Expense[] {
  return [...expenses].sort(
    (a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt),
  )
}
