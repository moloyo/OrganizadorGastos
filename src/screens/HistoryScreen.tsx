import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronRight, History } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { ScreenHeader } from '../components/Shell'
import { Button, EmptyState } from '../components/ui'
import { monthKey, monthLabel } from '../lib/date'
import { formatCents } from '../lib/money'

export function HistoryScreen() {
  const { allExpenses, goToMonth } = useApp()
  const navigate = useNavigate()

  const months = useMemo(() => {
    const map = new Map<string, { count: number; cents: number }>()
    for (const expense of allExpenses) {
      const key = monthKey(expense.spentOn)
      const row = map.get(key) ?? { count: 0, cents: 0 }
      row.count += 1
      row.cents += expense.amountCents
      map.set(key, row)
    }
    return [...map.entries()]
      .map(([key, row]) => ({ key, ...row }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [allExpenses])

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Tu hogar"
        title="Historial"
        subtitle={months.length === 0 ? 'Acá vas a ver el resumen por mes.' : `${months.length} mes${months.length === 1 ? '' : 'es'} con gastos`}
      />

      {months.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<History className="size-6" />}
            title="Todavía no hay historial"
            description="Cuando registres gastos, vas a poder ver el total de cada mes."
            action={
              <Button size="sm" variant="secondary" onClick={() => navigate('/')}>
                <CalendarDays className="size-4" /> Ir a los gastos
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          {months.map((row) => (
            <button
              key={row.key}
              onClick={() => { goToMonth(row.key); navigate('/') }}
              className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand/40"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-[16px] font-semibold capitalize text-ink">
                  {monthLabel(row.key)}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {row.count} gasto{row.count === 1 ? '' : 's'} · total {formatCents(row.cents)}
                </p>
              </div>
              <span className="text-[14px] font-semibold tabular-nums text-ink">{formatCents(row.cents)}</span>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
