import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Check, Copy, Download, Link2, LogOut, Moon, Pencil, Sun, Trash2, Upload, Users, Waves,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'
import { ScreenHeader } from '../components/Shell'
import { Button, Input } from '../components/ui'
import { canLeaveHousehold } from '../lib/household'
import { buildInviteLink } from '../lib/invite'
import { applyTheme, readTheme, storeTheme, THEMES, type ThemeId } from '../lib/theme'
import { CURRENCIES } from '../lib/currency'
import { parseExpensesCsv } from '../lib/csv'
import { makeId } from '../lib/adapters'
import { todayISO } from '../lib/date'
import type { CurrencyCode, Snapshot, Trip } from '../types'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted">{title}</h2>
      {children}
    </section>
  )
}

const THEME_ICONS = { clasico: Sun, cool: Waves, oscuro: Moon } as const

export function SettingsScreen() {
  const {
    user, household, householdMembers, householdInvites, isCloud,
    refreshHousehold, createInvite, revokeInvite, renameHousehold, setBaseCurrency, setDisplayName, leaveHousehold,
    signOut, exportData, importData, wipeData, deleteAccount,
    toast, clearExpenses, trips, createTrip, deleteTrip, importCsvRows,
  } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())
  const [editName, setEditName] = useState(household?.name ?? '')
  const [editCurrency, setEditCurrency] = useState<CurrencyCode>(household?.baseCurrency ?? 'EUR')
  const [myName, setMyName] = useState('')
  const [newLink, setNewLink] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tripName, setTripName] = useState('')
  const [tripCurrency, setTripCurrency] = useState<CurrencyCode>('EUR')
  const [tripStart, setTripStart] = useState(todayISO())
  const [tripEnd, setTripEnd] = useState(todayISO())
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  )

  useEffect(() => {
    setEditName(household?.name ?? '')
    setEditCurrency(household?.baseCurrency ?? 'EUR')
    setMyName(householdMembers.find((member) => member.userId === user?.id)?.name ?? user?.name ?? '')
  }, [household?.id, household?.name, household?.baseCurrency, householdMembers, user?.id, user?.name])

  const activeInvites = householdInvites.filter(
    (invite) => !invite.revokedAt && new Date(invite.expiresAt) > new Date(),
  )

  async function handleRename() {
    const name = editName.trim()
    if (!name) { toast('Poné un nombre para el hogar.', 'error'); return }
    if (name.length > 60) { toast('El nombre puede tener hasta 60 caracteres.', 'error'); return }
    setBusy('rename')
    try { await renameHousehold(name); toast('Nombre actualizado.', 'success') }
    catch (error) { toast(error instanceof Error ? error.message : 'No pudimos renombrar.', 'error') }
    finally { setBusy(null) }
  }

  async function handleMyName() {
    const name = myName.trim()
    if (!name) { toast('Poné tu nombre.', 'error'); return }
    setBusy('myName')
    try { await setDisplayName(name); toast('Nombre actualizado.', 'success') }
    catch (error) { toast(error instanceof Error ? error.message : 'No pudimos cambiar tu nombre.', 'error') }
    finally { setBusy(null) }
  }

  async function handleCurrency() {
    setBusy('currency')
    try { await setBaseCurrency(editCurrency); toast('Moneda base actualizada.', 'success') }
    catch (error) { toast(error instanceof Error ? error.message : 'No pudimos cambiar la moneda.', 'error') }
    finally { setBusy(null) }
  }

  async function handleCreateInvite() {
    setBusy('invite')
    try {
      const invite = await createInvite()
      setNewToken(invite.token)
      setNewLink(buildInviteLink(invite.token))
      toast('Link de invitación creado.', 'success')
    } catch (error) { toast(error instanceof Error ? error.message : 'No pudimos crear el link.', 'error') }
    finally { setBusy(null) }
  }

  async function copyLink(link: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles')
      await navigator.clipboard.writeText(link)
      toast('Link copiado.', 'success')
    } catch {
      const area = document.createElement('textarea')
      area.value = link
      area.style.position = 'fixed'
      area.style.top = '-9999px'
      document.body.appendChild(area)
      area.select()
      let copied = false
      try { copied = document.execCommand('copy') } catch { copied = false }
      document.body.removeChild(area)
      toast(copied ? 'Link copiado.' : 'No pudimos copiar el link.', copied ? 'success' : 'error')
    }
  }

  async function handleRevoke(token: string) {
    setBusy(`revoke:${token}`)
    try {
      await revokeInvite(token)
      if (newToken === token) { setNewLink(null); setNewToken(null) }
      toast('Link revocado.', 'success')
    } catch (error) { toast(error instanceof Error ? error.message : 'No pudimos revocar.', 'error') }
    finally { setBusy(null) }
  }

  async function handleExport() {
    setBusy('export')
    try {
      const snapshot = await exportData()
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `gastos-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast('Copia de seguridad descargada.', 'success')
    } catch (error) { toast(error instanceof Error ? error.message : 'No pudimos exportar.', 'error') }
    finally { setBusy(null) }
  }

  async function handleImport(file: File) {
    setBusy('import')
    try {
      const parsed = JSON.parse(await file.text()) as Snapshot
      if (parsed?.app !== 'gastos' || !Array.isArray(parsed.expenses)) {
        throw new Error('El archivo no es un backup de Gastos.')
      }
      if (!window.confirm('Importar reemplaza todos tus gastos. ¿Querés continuar?')) return
      await importData(parsed)
    } catch (error) { toast(error instanceof Error ? error.message : 'No pudimos importar.', 'error') }
    finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleCsvImport(file: File) {
    setBusy('csv')
    try {
      const result = parseExpensesCsv(await file.text())
      if (result.rows.length === 0) {
        toast(result.errors[0] ?? 'No se encontraron gastos en el archivo.', 'error')
        return
      }
      if (!window.confirm(`Se encontraron ${result.rows.length} gastos. ¿Importarlos?`)) return
      const count = await importCsvRows(result.rows)
      if (result.errors.length > 0) toast(`${count} gastos importados. ${result.errors.length} filas se omitieron.`, 'info')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos importar el CSV.', 'error')
    } finally {
      setBusy(null)
      if (csvRef.current) csvRef.current.value = ''
    }
  }

  async function handleEnableNotifications() {
    if (typeof Notification === 'undefined') { toast('Este navegador no admite notificaciones.', 'error'); return }
    try {
      const result = await Notification.requestPermission()
      setNotificationPermission(result)
      toast(result === 'granted' ? 'Notificaciones activadas.' : 'Permiso no concedido.', result === 'granted' ? 'success' : 'info')
    } catch {
      toast('No pudimos pedir el permiso.', 'error')
    }
  }

  async function handleCreateTrip() {
    const name = tripName.trim()
    if (!name) { toast('Poné un nombre para el viaje.', 'error'); return }
    setBusy('trip')
    const trip: Trip = {
      id: makeId(), name, baseCurrency: tripCurrency,
      startsOn: tripStart, endsOn: tripEnd, archived: false,
    }
    try { await createTrip(trip); setTripName(''); toast('Viaje creado.', 'success') }
    catch (error) { toast(error instanceof Error ? error.message : 'No pudimos crear el viaje.', 'error') }
    finally { setBusy(null) }
  }

  async function handleDeleteTrip(id: string) {
    if (!window.confirm('¿Eliminar el viaje? Sus gastos vuelven al hogar.')) return
    try { await deleteTrip(id) }
    catch (error) { toast(error instanceof Error ? error.message : 'No pudimos eliminar el viaje.', 'error') }
  }

  async function handleLeave() {
    if (!window.confirm('¿Salir del hogar? Los gastos compartidos quedan para los demás miembros.')) return
    setBusy('leave')
    try { await leaveHousehold(); setNewLink(null); setNewToken(null) }
    catch (error) { toast(error instanceof Error ? error.message : 'No pudimos salir.', 'error') }
    finally { setBusy(null) }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('¿Eliminar tu cuenta? Esta acción no se puede deshacer.')) return
    if (!window.confirm('Última confirmación: se borra tu cuenta.')) return
    setBusy('delete')
    try { await deleteAccount(); toast('Cuenta eliminada.', 'success') }
    catch (error) { toast(error instanceof Error ? error.message : 'No pudimos eliminar la cuenta.', 'error') }
    finally { setBusy(null) }
  }

  async function handleWipe() {
    if (!window.confirm('¿Borrar TODOS los gastos del hogar? No se puede deshacer.')) return
    setBusy('wipe')
    try { await wipeData() }
    catch (error) { toast(error instanceof Error ? error.message : 'No pudimos borrar.', 'error') }
    finally { setBusy(null) }
  }

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Configuración"
        title="Ajustes"
        subtitle={isCloud ? 'Tus datos se sincronizan en la nube.' : 'Tus datos viven en este dispositivo.'}
      />

      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft font-display text-lg font-semibold text-brand-dark">
            {(user?.email?.[0] ?? 'L').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-ink">{user?.email ?? 'Sesión local'}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
              <span className="size-1.5 rounded-full bg-brand" />
              {isCloud ? 'Cuenta en la nube' : 'Solo este dispositivo'}
            </p>
            {household && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                <Users className="size-3 shrink-0" /> {household.name}
              </p>
            )}
          </div>
          {isCloud && (
            <Button size="icon" variant="ghost" onClick={() => void signOut()} aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {isCloud && household && (
        <Section title="Hogar">
          <div className="space-y-3">
            <div className="card p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Users className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-ink">{household.name}</p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-dark">
                    <Users className="size-3" /> {household.memberCount} miembro{household.memberCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={60} aria-label="Nombre del hogar" />
                <Button size="sm" variant="secondary" onClick={() => void handleRename()} disabled={busy === 'rename'}>
                  <Pencil className="size-3.5" /> Guardar
                </Button>
              </div>
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-1 text-[12px] font-semibold text-ink">Moneda base</p>
                <p className="mb-2 text-[11px] leading-relaxed text-muted">
                  Los totales y el saldo se muestran en esta moneda. Cada gasto guarda su equivalente.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={editCurrency}
                    onChange={(event) => setEditCurrency(event.target.value as CurrencyCode)}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-field px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
                    aria-label="Moneda base"
                  >
                    {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" onClick={() => void handleCurrency()} disabled={busy === 'currency'}>
                    Guardar
                  </Button>
                </div>
              </div>
            </div>

            <div className="card divide-y divide-line overflow-hidden">
              {householdMembers.map((member) => (
                <div key={member.userId} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cream text-[11px] font-semibold uppercase text-muted">
                    {member.email?.[0] ?? '?'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                    {member.email}
                    {user?.id === member.userId && <span className="ml-1.5 text-[11px] font-normal text-muted">(vos)</span>}
                  </span>
                  <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-[10.5px] font-semibold text-muted">
                    {member.role === 'owner' ? 'Dueño' : 'Miembro'}
                  </span>
                </div>
              ))}
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-brand" />
                <p className="text-[13px] font-semibold text-ink">Invitaciones</p>
              </div>
              {newLink && (
                <div className="mt-3 rounded-xl bg-brand-soft/50 p-3">
                  <p className="mb-1.5 text-[11px] font-semibold text-brand-dark">Nuevo link listo para compartir</p>
                  <Input value={newLink} readOnly aria-label="Nuevo link de invitación" className="text-[11.5px]" />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void copyLink(newLink)}><Copy className="size-3.5" /> Copiar</Button>
                    <Button size="sm" variant="danger" onClick={() => newToken && void handleRevoke(newToken)}>Revocar</Button>
                  </div>
                </div>
              )}
              <Button size="sm" className="mt-3 w-full" onClick={() => void handleCreateInvite()} disabled={busy === 'invite'}>
                <Link2 className="size-3.5" /> {busy === 'invite' ? 'Creando…' : 'Crear link de invitación'}
              </Button>
              {activeInvites.length > 0 ? (
                <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {activeInvites.map((invite) => (
                    <div key={invite.token} className="flex items-center gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11.5px] font-medium text-ink">{invite.token.slice(0, 8)}…</p>
                        <p className="mt-0.5 text-[10.5px] text-muted">
                          Vence el {new Date(invite.expiresAt).toLocaleDateString('es-AR')} · usado {invite.usedCount} {invite.usedCount === 1 ? 'vez' : 'veces'}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" aria-label="Copiar link" onClick={() => void copyLink(buildInviteLink(invite.token))}><Copy className="size-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label="Revocar link" onClick={() => void handleRevoke(invite.token)}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-cream px-3 py-2.5 text-[11.5px] text-muted">No hay links activos.</p>
              )}
            </div>
          </div>
        </Section>
      )}

      <Section title="Notificaciones">
        <div className="card p-4">
          <p className="text-[12.5px] font-semibold text-ink">Avisos del navegador</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Si dejás la app abierta en una pestaña, vas a recibir un aviso cuando alguien cargue un gasto. Siempre podés ver el historial en el campanito.
          </p>
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => void handleEnableNotifications()}
            disabled={notificationPermission === 'granted'}
          >
            {notificationPermission === 'granted'
              ? 'Notificaciones activadas'
              : notificationPermission === 'denied'
                ? 'Permiso bloqueado (activarlo en el navegador)'
                : 'Activar notificaciones'}
          </Button>
        </div>
      </Section>

      <Section title="Tu nombre">
        <div className="card p-4">
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            Así te van a ver en los gastos y en el saldo.
          </p>
          <div className="flex items-center gap-2">
            <Input value={myName} onChange={(event) => setMyName(event.target.value)} maxLength={40} aria-label="Tu nombre" />
            <Button size="sm" variant="secondary" onClick={() => void handleMyName()} disabled={busy === 'myName'}>
              Guardar
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Viajes">
        <div className="card space-y-3 p-4">
          <p className="text-[11.5px] leading-relaxed text-muted">
            Un viaje es un bolsillo separado: tiene su propia moneda base y sus gastos no mezclan con los del hogar.
          </p>
          {trips.length > 0 && (
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {trips.map((trip) => (
                <div key={trip.id} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{trip.name}</p>
                    <p className="text-[10.5px] text-muted">{trip.baseCurrency} · {trip.startsOn} al {trip.endsOn}</p>
                  </div>
                  <button onClick={() => void handleDeleteTrip(trip.id)} aria-label={`Eliminar viaje ${trip.name}`}
                    className="grid size-7 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger-ink">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Input value={tripName} onChange={(event) => setTripName(event.target.value)} placeholder="Nombre del viaje" aria-label="Nombre del viaje" />
          <div className="grid grid-cols-3 gap-2">
            <select value={tripCurrency} onChange={(event) => setTripCurrency(event.target.value as CurrencyCode)}
              className="rounded-lg border border-line bg-field px-2 py-2 text-[12px] text-ink" aria-label="Moneda del viaje">
              {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
            </select>
            <Input type="date" value={tripStart} onChange={(event) => setTripStart(event.target.value)} aria-label="Inicio del viaje" />
            <Input type="date" value={tripEnd} onChange={(event) => setTripEnd(event.target.value)} aria-label="Fin del viaje" />
          </div>
          <Button size="sm" className="w-full" onClick={() => void handleCreateTrip()} disabled={busy === 'trip'}>
            Crear viaje
          </Button>
        </div>
      </Section>

      <Section title="Apariencia">
        <div className="card p-3">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((option) => {
              const active = theme === option.id
              const Icon = THEME_ICONS[option.id]
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { storeTheme(option.id); setTheme(option.id); applyTheme(option.id) }}
                  className={clsx(
                    'rounded-2xl border p-2 text-left transition',
                    active ? 'border-brand bg-brand-soft/40 ring-2 ring-brand/20' : 'border-line hover:border-line-strong',
                  )}
                >
                  <span className="mb-2 flex h-12 items-center justify-center gap-1.5 rounded-xl border border-black/5" style={{ backgroundColor: option.preview.background }} aria-hidden>
                    <span className="h-5 w-3 rounded-md" style={{ backgroundColor: option.preview.surface }} />
                    <span className="size-4 rounded-full" style={{ backgroundColor: option.preview.brand }} />
                  </span>
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-ink">
                    <Icon className="size-3.5 shrink-0 text-muted" /> {option.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted">{option.hint}</span>
                </button>
              )
            })}
          </div>
        </div>
      </Section>

      <Section title="Datos">
        <div className="card divide-y divide-line overflow-hidden">
          <button onClick={() => void handleExport()} disabled={busy === 'export'} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-brand-soft/20">
            <Download className="size-4 text-brand" />
            <span className="flex-1 text-[13px] font-medium text-ink">Exportar copia de seguridad</span>
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy === 'import'} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-brand-soft/20">
            <Upload className="size-4 text-brand" />
            <span className="flex-1 text-[13px] font-medium text-ink">Importar desde un archivo</span>
          </button>
          <button onClick={() => csvRef.current?.click()} disabled={busy === 'csv'} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-brand-soft/20">
            <Upload className="size-4 text-brand" />
            <span className="flex-1 text-[13px] font-medium text-ink">Importar desde tricount (CSV)</span>
          </button>
          <button onClick={() => void clearExpenses()} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-brand-soft/20">
            <Check className="size-4 text-brand" />
            <span className="flex-1 text-[13px] font-medium text-ink">Vaciar lista de gastos</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleImport(file)
          }}
        />
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleCsvImport(file)
          }}
        />
      </Section>

      <Section title="Zona peligrosa">
        <div className="space-y-2">
          {isCloud && canLeaveHousehold(household) && (
            <button
              onClick={() => void handleLeave()}
              disabled={busy === 'leave'}
              className="flex w-full items-center gap-3 rounded-2xl border border-danger-border bg-danger-soft/60 px-4 py-3.5 text-left transition hover:bg-danger-soft"
            >
              <LogOut className="size-4 text-danger-ink" />
              <span className="flex-1 text-[13px] font-medium text-danger-strong">
                {busy === 'leave' ? 'Saliendo…' : 'Salir del hogar'}
              </span>
            </button>
          )}
          {isCloud && (
            <button
              onClick={() => void handleDeleteAccount()}
              disabled={busy === 'delete'}
              className="flex w-full items-center gap-3 rounded-2xl border border-danger-border bg-danger-soft/60 px-4 py-3.5 text-left transition hover:bg-danger-soft"
            >
              <Trash2 className="size-4 text-danger-ink" />
              <span className="flex-1 text-[13px] font-medium text-danger-strong">Eliminar mi cuenta</span>
            </button>
          )}
          <button
            onClick={() => void handleWipe()}
            disabled={busy === 'wipe'}
            className="flex w-full items-center gap-3 rounded-2xl border border-danger-border bg-danger-soft/60 px-4 py-3.5 text-left transition hover:bg-danger-soft"
          >
            <Trash2 className="size-4 text-danger-ink" />
            <span className="flex-1 text-[13px] font-medium text-danger-strong">Borrar todos los datos</span>
          </button>
        </div>
      </Section>

      <footer className="mt-8 flex flex-col items-center gap-1 pb-2 text-center">
        <span className="text-[11px] font-semibold text-brand">Organizador de Gastos</span>
        <span className="text-[10.5px] text-muted">v0.1 · PWA</span>
      </footer>
    </div>
  )
}
