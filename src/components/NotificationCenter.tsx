import { useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Button, EmptyState, Sheet } from './ui'
import { formatMoney } from '../lib/money'
import { formatShortDate } from '../lib/date'
import { memberLabel } from '../lib/members'

export function NotificationCenter() {
  const {
    notifications, unreadCount, markNotificationRead, markAllNotificationsRead,
    baseCurrency, householdMembers, user,
  } = useApp()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Notificaciones${unreadCount > 0 ? `, ${unreadCount} sin leer` : ''}`}
        className="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-brand-soft/40 hover:text-brand"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-danger-ink text-[9px] font-bold text-on-brand">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Notificaciones"
        subtitle={unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
        footer={
          unreadCount > 0 ? (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => void markAllNotificationsRead()}
            >
              <CheckCheck className="size-4" /> Marcar todas como leídas
            </Button>
          ) : undefined
        }
      >
        {notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-6" />}
            title="Sin notificaciones"
            description="Cuando alguien del hogar cargue un gasto, te va a aparecer acá."
          />
        ) : (
          <ul className="space-y-2">
            {notifications.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void markNotificationRead(item.id)}
                  className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${
                    item.readAt ? 'border-line bg-surface' : 'border-brand/30 bg-brand-soft/40'
                  }`}
                >
                  <span className={`mt-1 size-2 shrink-0 rounded-full ${item.readAt ? 'bg-line' : 'bg-brand'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">
                      {memberLabel(item.actorId ?? '', householdMembers, user?.id)} cargó un gasto
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink">
                      {item.description || 'Gasto'} · {formatMoney(item.amountCents, baseCurrency)}
                    </span>
                    <span className="mt-1 block text-[10.5px] text-muted">
                      {formatShortDate(item.createdAt.slice(0, 10))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  )
}
