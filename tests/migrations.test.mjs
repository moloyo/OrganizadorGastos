import { describe, expect, it } from 'vitest'
import {
  baselineCommand, listMigrations, validateMigrations,
} from '../scripts/migrations.mjs'

describe('migraciones versionadas', () => {
  it('la migración del repo tiene nombre válido', () => {
    const migrations = listMigrations()
    expect(migrations.length).toBe(5)
    expect(migrations.map((migration) => migration.version)).toEqual([
      '20261116000000',
      '20261116000100',
      '20261116000200',
      '20261116000300',
      '20261116000400',
    ])
    expect(validateMigrations(migrations)).toMatchObject({ ok: true, count: 5 })
  })

  it('detecta timestamps duplicados', () => {
    const check = validateMigrations([
      { version: '20261116000000', file: 'a.sql' },
      { version: '20261116000000', file: 'b.sql' },
    ])
    expect(check.ok).toBe(false)
    expect(check.duplicates).toEqual(['20261116000000'])
  })

  it('detecta una lista desordenada', () => {
    const check = validateMigrations([
      { version: '20261117000000', file: 'b.sql' },
      { version: '20261116000000', file: 'a.sql' },
    ])
    expect(check.ok).toBe(false)
    expect(check.sorted).toBe(false)
  })

  it('el baseline marca la versión como aplicada', () => {
    expect(
      baselineCommand([{ version: '20261116000000', file: 'a.sql' }]),
    ).toBe('supabase migration repair 20261116000000 --status applied --linked')
  })
})
