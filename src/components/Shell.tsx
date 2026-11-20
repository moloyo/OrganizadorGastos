import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { CloudUpload, PieChart, RefreshCw, Scale, Wallet, WifiOff, Settings, History } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'
import { NotificationCenter } from './NotificationCenter'

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl bg-brand text-on-brand"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" width={size * 0.6} height={size * 0.6} fill="none">
        <circle cx="16" cy="16" r="10" fill="var(--color-cream, #FAF6EF)" />
        <g stroke="var(--color-brand, #2F6A4F)" strokeWidth="2.2" strokeLinecap="round">
          <path d="M20 11.5c-2-2-6-1.6-6 1.2s6 2.8 6 5.6-4 3.2-6 1.2" />
          <path d="M16 9.5v13" />
        </g>
      </svg>
    </span>
  )
}

export function ScreenHeader({
  eyebrow, title, subtitle, action,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">{eyebrow}</p>
        )}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

const TABS = [
  { to: '/', label: 'Gastos', icon: Wallet, end: true },
  { to: '/saldo', label: 'Saldo', icon: Scale },
  { to: '/rubros', label: 'Rubros', icon: PieChart },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

function OfflineBanner() {
  const { offlineStatus, retrySync } = useApp()
  const { online, pending, syncing } = offlineStatus
  if (online && pending === 0 && !syncing) return null
  const changes = `${pending} cambio${pending === 1 ? '' : 's'}`
  const label = !online
    ? pending > 0
      ? `Sin conexión · ${changes} se sincroniza${pending === 1 ? '' : 'n'} al volver`
      : 'Sin conexión · mostrando los últimos datos guardados'
    : syncing
      ? 'Sincronizando cambios pendientes…'
      : `${changes} pendiente${pending === 1 ? '' : 's'} de sincronizar`
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft/60 px-3 py-2 text-[11.5px] font-medium text-ink"
    >
      {online ? (
        <CloudUpload className={clsx('size-4 shrink-0 text-accent', syncing && 'animate-pulse')} />
      ) : (
        <WifiOff className="size-4 shrink-0 text-accent" />
      )}
      <span className="min-w-0 flex-1">{label}</span>
      {online && pending > 0 && !syncing && (
        <button
          type="button"
          onClick={retrySync}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-brand"
        >
          <RefreshCw className="size-3" />
          Reintentar
        </button>
      )}
    </div>
  )
}

function TripSwitcher() {
  const { trips, activeTripId, setActiveTrip } = useApp()
  if (trips.length === 0) return null
  return (
    <div className="mb-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Elegir ámbito">
      <button
        onClick={() => setActiveTrip(null)}
        aria-pressed={activeTripId === null}
        className={clsx(
          'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
          activeTripId === null ? 'bg-brand text-on-brand' : 'bg-surface text-muted hover:text-ink',
        )}
      >
        Hogar
      </button>
      {trips.map((trip) => (
        <button
          key={trip.id}
          onClick={() => setActiveTrip(trip.id)}
          aria-pressed={activeTripId === trip.id}
          className={clsx(
            'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
            activeTripId === trip.id ? 'bg-brand text-on-brand' : 'bg-surface text-muted hover:text-ink',
          )}
        >
          {trip.name}
        </button>
      ))}
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <main className="flex-1 px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-2 flex justify-end"><NotificationCenter /></div>
        <OfflineBanner />
        <TripSwitcher />
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[560px] justify-around border-t border-line bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                clsx(
                  'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1 text-[10px] font-semibold transition',
                  isActive ? 'text-brand' : 'text-muted hover:text-ink',
                )
              }
            >
              <Icon className="size-5" />
              {tab.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
