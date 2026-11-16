import { describe, expect, it } from 'vitest'
import {
  allocateCents,
  computeBalances,
  equalShares,
  isValidShares,
  monthOf,
  monthSummary,
  overallSummary,
  partsFromShares,
  settle,
  sharesFromParts,
  sharesFromPercents,
  splitByCategory,
  isValidParts,
  type SharedExpense,
} from '../src/lib/balance'

const ANA = 'ana'
const LUCAS = 'lucas'

function gasto(amountCents: number, paidBy: string, shares: Record<string, number>, spentOn = '2026-11-10'): SharedExpense {
  return { amountCents, baseAmountCents: amountCents, paidBy, shares, spentOn }
}

describe('repartos', () => {
  it('equalShares reparte 10000 puntos sin perder ninguno', () => {
    expect(equalShares([ANA, LUCAS])).toEqual({ ana: 5000, lucas: 5000 })
    const tres = equalShares(['a', 'b', 'c'])
    expect(Object.values(tres).reduce((t, v) => t + v, 0)).toBe(10000)
    expect(equalShares([])).toEqual({})
  })

  it('valida que los puntos sumen 10000 y sean enteros positivos', () => {
    expect(isValidShares({ ana: 7000, lucas: 3000 })).toBe(true)
    expect(isValidShares({ ana: 7000, lucas: 2000 })).toBe(false)
    expect(isValidShares({ ana: 10500, lucas: -500 })).toBe(false)
    expect(isValidShares({ ana: 5000.5, lucas: 4999.5 })).toBe(false)
    expect(isValidShares({})).toBe(false)
  })
})

describe('porcentajes ingresados', () => {
  it('convierte porcentajes con coma o punto a puntos básicos', () => {
    expect(sharesFromPercents({ [ANA]: '50', [LUCAS]: '50' })).toEqual({ ana: 5000, lucas: 5000 })
    expect(sharesFromPercents({ [ANA]: '70,5', [LUCAS]: '29.5' })).toEqual({ ana: 7050, lucas: 2950 })
  })

  it('rechaza totales que no llegan a 100 % o formatos inválidos', () => {
    expect(sharesFromPercents({ [ANA]: '50', [LUCAS]: '40' })).toBeNull()
    expect(sharesFromPercents({ [ANA]: '50', [LUCAS]: '60' })).toBeNull()
    expect(sharesFromPercents({ [ANA]: '50.123', [LUCAS]: '49.877' })).toBeNull()
    expect(sharesFromPercents({ [ANA]: '-10', [LUCAS]: '110' })).toBeNull()
    expect(sharesFromPercents({ [ANA]: 'abc', [LUCAS]: '100' })).toBeNull()
  })

  it('un campo vacío cuenta como 0 %', () => {
    expect(sharesFromPercents({ [ANA]: '', [LUCAS]: '100' })).toEqual({ ana: 0, lucas: 10000 })
  })
})

describe('reparto por partes', () => {
  it('convierte 2:1 a dos tercios y un tercio sin perder puntos', () => {
    const shares = sharesFromParts({ [ANA]: 2, [LUCAS]: 1 })
    expect(shares).toEqual({ ana: 6667, lucas: 3333 })
    expect(Object.values(shares!).reduce((t, v) => t + v, 0)).toBe(10000)
  })

  it('1:1 es 50/50 y un solo participante se queda con todo', () => {
    expect(sharesFromParts({ [ANA]: 1, [LUCAS]: 1 })).toEqual({ ana: 5000, lucas: 5000 })
    expect(sharesFromParts({ [ANA]: 3, [LUCAS]: 0 })).toEqual({ ana: 10000 })
  })

  it('rechaza partes inválidas', () => {
    expect(isValidParts({ ana: 0, lucas: 0 })).toBe(false)
    expect(isValidParts({ ana: -1, lucas: 2 })).toBe(false)
    expect(isValidParts({ ana: 1.5, lucas: 1 })).toBe(false)
    expect(sharesFromParts({ ana: 0, lucas: 0 })).toBeNull()
  })

  it('reparte los centavos de un gasto según las partes', () => {
    const shares = sharesFromParts({ [ANA]: 2, [LUCAS]: 1 })!
    expect(allocateCents(10000, shares)).toEqual({ ana: 6667, lucas: 3333 })
    expect(allocateCents(100, shares)).toEqual({ ana: 67, lucas: 33 })
  })

  it('recupera partes simples desde porcentajes con decimales', () => {
    expect(partsFromShares({ [ANA]: 6667, [LUCAS]: 3333 })).toEqual({ ana: 2, lucas: 1 })
    expect(partsFromShares({ [ANA]: 7000, [LUCAS]: 3000 })).toEqual({ ana: 7, lucas: 3 })
    expect(partsFromShares({ [ANA]: 5000, [LUCAS]: 5000 })).toEqual({ ana: 1, lucas: 1 })
  })

  it('conserva a quien tiene cero partes', () => {
    expect(partsFromShares({ [ANA]: 10000, [LUCAS]: 0 })).toEqual({ ana: 1, lucas: 0 })
  })
})

describe('allocateCents', () => {
  it('reparte al 50/50 un monto par', () => {
    expect(allocateCents(10000, { [ANA]: 5000, [LUCAS]: 5000 })).toEqual({ ana: 5000, lucas: 5000 })
  })

  it('no pierde el centavo sobrante en un monto impar', () => {
    const parts = allocateCents(1001, { [ANA]: 5000, [LUCAS]: 5000 })
    expect(parts.ana + parts.lucas).toBe(1001)
    expect(parts).toEqual({ ana: 501, lucas: 500 })
  })

  it('respeta porcentajes libres y la suma siempre es exacta', () => {
    const parts = allocateCents(9999, { [ANA]: 7000, [LUCAS]: 3000 })
    expect(parts.ana + parts.lucas).toBe(9999)
    expect(parts).toEqual({ ana: 6999, lucas: 3000 })
  })

  it('un reparto del 100 % a una sola persona', () => {
    expect(allocateCents(4550, { [LUCAS]: 10000 })).toEqual({ lucas: 4550 })
  })
})

describe('saldo', () => {
  it('si uno pagó todo y se reparte 50/50, el otro le debe la mitad', () => {
    const { balances } = computeBalances([gasto(20000, ANA, { ana: 5000, lucas: 5000 })], [ANA, LUCAS])
    expect(balances).toEqual({ ana: 10000, lucas: -10000 })
  })

  it('compensa pagos cruzados', () => {
    const { balances } = computeBalances(
      [
        gasto(20000, ANA, { ana: 5000, lucas: 5000 }),
        gasto(6000, LUCAS, { ana: 5000, lucas: 5000 }),
      ],
      [ANA, LUCAS],
    )
    expect(balances).toEqual({ ana: 7000, lucas: -7000 })
  })

  it('un gasto exclusivo de una persona no genera deuda', () => {
    const { balances } = computeBalances([gasto(3000, ANA, { ana: 10000 })], [ANA, LUCAS])
    expect(balances).toEqual({ ana: 0, lucas: 0 })
  })

  it('los saldos siempre suman cero', () => {
    const { balances } = computeBalances(
      [
        gasto(1001, ANA, { ana: 3333, lucas: 6667 }),
        gasto(777, LUCAS, { ana: 5000, lucas: 5000 }),
      ],
      [ANA, LUCAS],
    )
    expect(Object.values(balances).reduce((t, v) => t + v, 0)).toBe(0)
  })
})

describe('moneda base', () => {
  it('los saldos usan el equivalente, no el monto en la moneda original', () => {
    const expenses: SharedExpense[] = [
      { amountCents: 10000, baseAmountCents: 8000, paidBy: ANA, shares: { ana: 5000, lucas: 5000 }, spentOn: '2026-11-01' },
    ]
    const { balances } = computeBalances(expenses, [ANA, LUCAS])
    expect(balances).toEqual({ ana: 4000, lucas: -4000 })
    expect(monthSummary(expenses, '2026-11').totalCents).toBe(8000)
  })
})

describe('saldo acumulado', () => {
  it('netea deudas de meses distintos', () => {
    const expenses = [
      gasto(20000, ANA, { ana: 5000, lucas: 5000 }, '2026-10-10'),
      gasto(10000, LUCAS, { ana: 5000, lucas: 5000 }, '2026-11-10'),
    ]
    const summary = overallSummary(expenses, [ANA, LUCAS])
    expect(summary.totalCents).toBe(30000)
    expect(summary.balances).toEqual({ ana: 5000, lucas: -5000 })
    expect(summary.settlements).toEqual([{ from: LUCAS, to: ANA, cents: 5000 }])
  })

  it('un pago de cualquier mes descuenta del saldo acumulado', () => {
    const expenses = [gasto(20000, ANA, { ana: 5000, lucas: 5000 }, '2026-10-10')]
    const transfers = [{ from: LUCAS, to: ANA, baseAmountCents: 10000, paidOn: '2026-11-16' }]
    expect(overallSummary(expenses, [ANA, LUCAS], transfers).balances).toEqual({ ana: 0, lucas: 0 })
  })
})

describe('transferencias', () => {
  it('un pago entre miembros deja el saldo en cero', () => {
    const expenses = [gasto(20000, ANA, { ana: 5000, lucas: 5000 })]
    const transfer = { from: LUCAS, to: ANA, baseAmountCents: 10000, paidOn: '2026-11-16' }
    expect(computeBalances(expenses, [ANA, LUCAS], [transfer]).balances).toEqual({ ana: 0, lucas: 0 })
  })

  it('un pago parcial reduce la deuda', () => {
    const expenses = [gasto(20000, ANA, { ana: 5000, lucas: 5000 })]
    const transfer = { from: LUCAS, to: ANA, baseAmountCents: 4000, paidOn: '2026-11-16' }
    expect(computeBalances(expenses, [ANA, LUCAS], [transfer]).balances).toEqual({ ana: 6000, lucas: -6000 })
  })

  it('mesSummary ignora transferencias de otros meses', () => {
    const expenses = [gasto(20000, ANA, { ana: 5000, lucas: 5000 })]
    const transfer = { from: LUCAS, to: ANA, baseAmountCents: 10000, paidOn: '2026-10-16' }
    expect(monthSummary(expenses, '2026-11', [ANA, LUCAS], [transfer]).balances)
      .toEqual({ ana: 10000, lucas: -10000 })
  })
})

describe('liquidación', () => {
  it('sin deudas no hay transferencias', () => {
    expect(settle({ ana: 0, lucas: 0 })).toEqual([])
  })

  it('una sola transferencia entre dos personas', () => {
    expect(settle({ ana: 7000, lucas: -7000 })).toEqual([{ from: LUCAS, to: ANA, cents: 7000 }])
  })

  it('con tres personas usa el mínimo de transferencias', () => {
    const result = settle({ a: 5000, b: -3000, c: -2000 })
    expect(result).toHaveLength(2)
    expect(result.reduce((t, s) => t + s.cents, 0)).toBe(5000)
    expect(result).toEqual([
      { from: 'b', to: 'a', cents: 3000 },
      { from: 'c', to: 'a', cents: 2000 },
    ])
  })
})

describe('reparto por rubro', () => {
  it('agrupa por rubro y reparte cada uno según sus porcentajes', () => {
    const result = splitByCategory(
      [
        { ...gasto(10000, ANA, { ana: 5000, lucas: 5000 }), category: 'Alimentación' },
        { ...gasto(6000, LUCAS, { ana: 7000, lucas: 3000 }), category: 'Hogar' },
        { ...gasto(2000, ANA, { ana: 5000, lucas: 5000 }), category: 'Alimentación' },
        { ...gasto(900, ANA, { ana: 5000, lucas: 5000 }, '2026-10-30'), category: 'Salud' },
      ],
      '2026-11',
    )
    expect(result).toEqual([
      { category: 'Alimentación', totalCents: 12000, owedCents: { ana: 6000, lucas: 6000 } },
      { category: 'Hogar', totalCents: 6000, owedCents: { ana: 4200, lucas: 1800 } },
    ])
  })

  it('un mes sin gastos no tiene rubros', () => {
    expect(splitByCategory([], '2026-11')).toEqual([])
  })
})

describe('resumen mensual', () => {
  it('filtra por mes y deja afuera los demás', () => {
    const expenses = [
      gasto(10000, ANA, { ana: 5000, lucas: 5000 }, '2026-11-01'),
      gasto(50000, LUCAS, { ana: 5000, lucas: 5000 }, '2026-10-31'),
    ]
    const summary = monthSummary(expenses, '2026-11', [ANA, LUCAS])
    expect(summary.totalCents).toBe(10000)
    expect(summary.balances).toEqual({ ana: 5000, lucas: -5000 })
    expect(summary.settlements).toEqual([{ from: LUCAS, to: ANA, cents: 5000 }])
  })

  it('un mes sin gastos da todo en cero', () => {
    const summary = monthSummary([], '2026-11', [ANA, LUCAS])
    expect(summary.totalCents).toBe(0)
    expect(summary.balances).toEqual({ ana: 0, lucas: 0 })
    expect(summary.settlements).toEqual([])
  })

  it('monthOf toma yyyy-MM de la fecha', () => {
    expect(monthOf('2026-11-16')).toBe('2026-11')
  })
})
