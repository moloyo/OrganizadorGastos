import { describe, expect, it } from 'vitest'
import { isUuid, newUuid } from '../src/lib/uuid'

describe('ids', () => {
  it('newUuid genera UUID válidos y distintos', () => {
    const a = newUuid()
    const b = newUuid()
    expect(isUuid(a)).toBe(true)
    expect(isUuid(b)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('isUuid rechaza ids viejos', () => {
    expect(isUuid('seed-1')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid('3e26e041-6162-4d60-8e0f-99aec06bf4e6')).toBe(true)
  })
})
