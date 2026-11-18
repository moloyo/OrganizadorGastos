import { describe, expect, it } from 'vitest'
import type { HouseholdMember } from '../src/types'
import { memberIdsOf, memberLabel } from '../src/lib/members'

const members: HouseholdMember[] = [
  { userId: 'ana', email: 'ana@mail.com', name: 'Ana', role: 'owner', joinedAt: '2026-11-01T00:00:00.000Z' },
  { userId: 'lucas', email: 'lucas@mail.com', name: 'Lucas', role: 'member', joinedAt: '2026-11-02T00:00:00.000Z' },
]

describe('miembros del hogar', () => {
  it('usa los miembros cargados y, si no hay, sólo al usuario actual', () => {
    expect(memberIdsOf(members, { id: 'ana' })).toEqual(['ana', 'lucas'])
    expect(memberIdsOf([], { id: 'ana' })).toEqual(['ana'])
    expect(memberIdsOf([], null)).toEqual([])
  })

  it('muestra "Vos" para el usuario actual y el nombre para los demás', () => {
    expect(memberLabel('ana', members, 'ana')).toBe('Vos')
    expect(memberLabel('lucas', members, 'ana')).toBe('Lucas')
  })

  it('si falta el nombre, usa el email como respaldo', () => {
    const sinNombre = [{ ...members[1], name: '' }]
    expect(memberLabel('lucas', sinNombre, 'ana')).toBe('lucas@mail.com')
  })

  it('un id que ya no está en el hogar se muestra como "Otra persona"', () => {
    expect(memberLabel('borrado', members, 'ana')).toBe('Otra persona')
  })
})
