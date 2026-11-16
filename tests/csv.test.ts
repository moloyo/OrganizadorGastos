import { describe, expect, it } from 'vitest'
import { amountFromCsv, dateFromCsv, parseCsv, parseExpensesCsv } from '../src/lib/csv'

describe('parseo de CSV', () => {
  it('respeta comillas y detecta punto y coma', () => {
    expect(parseCsv('a;b\n"con;coma";otro')).toEqual([['a', 'b'], ['con;coma', 'otro']])
  })

  it('convierte montos europeos y anglosajones', () => {
    expect(amountFromCsv('1.234,56')).toBe(123456)
    expect(amountFromCsv('1234.56')).toBe(123456)
    expect(amountFromCsv('$ 89,90')).toBe(8990)
    expect(amountFromCsv('abc')).toBeNull()
  })

  it('convierte fechas comunes', () => {
    expect(dateFromCsv('2026-11-16')).toBe('2026-11-16')
    expect(dateFromCsv('16/11/2026')).toBe('2026-11-16')
    expect(dateFromCsv('16-11-2026')).toBe('2026-11-16')
    expect(dateFromCsv('ayer')).toBeNull()
  })

  it('importa filas con cabeceras en español', () => {
    const result = parseExpensesCsv([
      'Descripción;Importe;Fecha;Rubro;Pagador',
      'Verdulería;1.234,56;16/11/2026;Alimentación;Ana',
    ].join('\n'))
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([{
      description: 'Verdulería', amountCents: 123456, spentOn: '2026-11-16',
      category: 'Alimentación', paidBy: 'Ana', currency: null,
    }])
  })

  it('rechaza archivos sin columnas obligatorias', () => {
    expect(parseExpensesCsv('foo;bar\n1;2').rows).toEqual([])
    expect(parseExpensesCsv('foo;bar\n1;2').errors).toHaveLength(1)
  })

  it('informa de las filas inválidas pero conserva las buenas', () => {
    const result = parseExpensesCsv([
      'description,amount,date',
      'Café,500,2026-11-01',
      ',300,2026-11-02',
      'Pan,xxx,2026-11-03',
    ].join('\n'))
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(2)
  })
})
