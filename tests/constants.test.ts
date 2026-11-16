import { describe, expect, it } from 'vitest'
import {
  CATEGORIES, categoryColor, normalizeCategory,
} from '../src/lib/constants'

describe('rubros de gastos', () => {
  it('son exactamente diez y empiezan por Alimentación', () => {
    expect(CATEGORIES).toEqual([
      'Alimentación', 'Transporte', 'Hogar', 'Salud',
      'Educación', 'Entretenimiento', 'Salidas', 'Vacaciones', 'Compras', 'Otros',
    ])
  })

  it('normaliza mayúsculas y valores desconocidos', () => {
    expect(normalizeCategory('ALIMENTACIÓN')).toBe('Alimentación')
    expect(normalizeCategory(' alimentación ')).toBe('Alimentación')
    expect(normalizeCategory('Comidas rápidas')).toBe('Otros')
    expect(normalizeCategory(undefined)).toBe('Otros')
  })

  it('cada rubro tiene color', () => {
    for (const category of CATEGORIES) {
      expect(categoryColor(category)).toMatch(/^#/)
    }
    expect(categoryColor('Inventado')).toBe('var(--color-muted)')
  })
})
