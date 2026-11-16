import { describe, expect, it } from 'vitest'
import type { Household } from '../src/types'
import { canLeaveHousehold } from '../src/lib/household'

const hogar = (memberCount: number): Household => ({
  id: 'hogar-1', name: 'Casa', role: 'owner', memberCount,
})

describe('salir del hogar', () => {
  it('se oculta con un único miembro', () => {
    expect(canLeaveHousehold(hogar(1))).toBe(false)
    expect(canLeaveHousehold(hogar(0))).toBe(false)
  })

  it('se muestra cuando quedan otros miembros', () => {
    expect(canLeaveHousehold(hogar(2))).toBe(true)
  })

  it('sin hogar cargado no se muestra', () => {
    expect(canLeaveHousehold(null)).toBe(false)
  })
})
