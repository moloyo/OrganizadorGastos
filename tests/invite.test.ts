import { describe, expect, it } from 'vitest'
import { inviteTokenFromHash } from '../src/lib/invite'

describe('links de invitación', () => {
  const token = '3e26e041-6162-4d60-8e0f-99aec06bf4e6'

  it('reconoce un token uuid en el hash', () => {
    expect(inviteTokenFromHash(`#/unirse/${token}`)).toBe(token)
    expect(inviteTokenFromHash(`#/unirse/${token.toUpperCase()}`)).toBe(token.toUpperCase())
  })

  it('ignora rutas que no son invitaciones', () => {
    expect(inviteTokenFromHash('#/')).toBeNull()
    expect(inviteTokenFromHash('#/ajustes')).toBeNull()
    expect(inviteTokenFromHash('#/unirse/no-es-uuid')).toBeNull()
    expect(inviteTokenFromHash('')).toBeNull()
  })
})
