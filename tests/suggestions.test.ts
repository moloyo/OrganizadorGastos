import { describe, expect, it } from 'vitest'
import type { Expense } from '../src/types'
import {
  normalizeText, rememberedCategory, suggestDescriptions,
} from '../src/lib/suggestions'

function gasto(description: string, category: string, spentOn: string, createdAt = `${spentOn}T10:00:00.000Z`): Expense {
  return {
    id: `${description}-${spentOn}-${createdAt}`,
    description,
    amountCents: 1000,
    category,
    spentOn,
    note: '',
    paidBy: 'ana',
    shares: { ana: 10000 },
    currency: 'EUR',
    baseAmountCents: 1000,
    createdAt,
  }
}

describe('normalización', () => {
  it('ignora mayúsculas, acentos y espacios repetidos', () => {
    expect(normalizeText('  Verdulería  Del Barrio ')).toBe('verduleria del barrio')
    expect(normalizeText('VERDULERIA')).toBe('verduleria')
  })
})

describe('sugerencias de descripción', () => {
  const expenses = [
    gasto('Verdulería', 'Alimentación', '2026-11-02'),
    gasto('Verdulería del barrio', 'Alimentación', '2026-11-10'),
    gasto('Farmacia', 'Salud', '2026-11-05'),
    gasto('Subte', 'Transporte', '2026-11-01'),
  ]

  it('encuentra por texto parcial, sin importar acentos ni mayúsculas', () => {
    const result = suggestDescriptions(expenses, 'verdu')
    expect(result.map((item) => item.description)).toEqual(['Verdulería del barrio', 'Verdulería'])
  })

  it('no repite una descripción y no sugiere la que ya está escrita exacta', () => {
    const repeated = [...expenses, gasto('verdulería', 'Alimentación', '2026-11-12')]
    expect(suggestDescriptions(repeated, 'verdulería').map((item) => item.description))
      .toEqual(['Verdulería del barrio'])
    expect(suggestDescriptions(repeated, 'ver').map((item) => item.description))
      .toEqual(['verdulería', 'Verdulería del barrio'])
  })

  it('escribir sin acentos ofrece la forma correcta de la descripción', () => {
    expect(suggestDescriptions(expenses, 'verduleria').map((item) => item.description))
      .toEqual(['Verdulería del barrio', 'Verdulería'])
  })

  it('texto vacío no sugiere nada', () => {
    expect(suggestDescriptions(expenses, '   ')).toEqual([])
  })
})

describe('rubro recordado', () => {
  it('toma el rubro del gasto más reciente con esa descripción', () => {
    const expenses = [
      gasto('Verdulería', 'Alimentación', '2026-10-02'),
      gasto('Verdulería', 'Hogar', '2026-11-02'),
    ]
    expect(rememberedCategory(expenses, 'verduleria')).toBe('Hogar')
  })

  it('si la descripción es nueva, no hay rubro recordado', () => {
    expect(rememberedCategory([gasto('Farmacia', 'Salud', '2026-11-05')], 'Verdulería')).toBeNull()
    expect(rememberedCategory([], '')).toBeNull()
  })
})
