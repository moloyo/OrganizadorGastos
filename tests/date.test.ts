import { describe, expect, it } from 'vitest'
import {
  currentMonthKey, formatShortDate, monthKey, monthLabel, shiftMonth, todayISO,
} from '../src/lib/date'

describe('fechas', () => {
  it('hoy es ISO yyyy-MM-dd', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('monthKey recorta al mes', () => {
    expect(monthKey('2026-11-15')).toBe('2026-11')
    expect(currentMonthKey()).toHaveLength(7)
  })

  it('shiftMonth cruza el año correctamente', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-11', 0)).toBe('2026-11')
  })

  it('etiquetas en español y fecha corta', () => {
    expect(monthLabel('2026-11')).toBe('noviembre 2026')
    expect(monthLabel('2026-01')).toBe('enero 2026')
    expect(formatShortDate('2026-11-15')).toBe('15 nov')
  })
})
