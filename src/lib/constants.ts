/** Rubros de gastos. Texto libre: se puede agregar uno nuevo sin migración. */
export const CATEGORIES = [
  'Alimentación',
  'Transporte',
  'Hogar',
  'Salud',
  'Educación',
  'Entretenimiento',
  'Otros',
] as const

export const CATEGORY_COLORS: Record<string, string> = {
  Alimentación: '#5C8A3A',
  Transporte: '#3E7CB1',
  Hogar: '#C98A2E',
  Salud: '#B4553F',
  Educación: '#7B6BB0',
  Entretenimiento: '#D9763D',
  Otros: '#6B7A70',
}

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'var(--color-muted)'
}

/** Normaliza un rubro viejo/desconocido a uno de la lista. */
export function normalizeCategory(category: string | undefined): string {
  if (!category) return 'Otros'
  const match = (CATEGORIES as readonly string[]).find(
    (item) => item.toLowerCase() === category.trim().toLowerCase(),
  )
  return match ?? 'Otros'
}
