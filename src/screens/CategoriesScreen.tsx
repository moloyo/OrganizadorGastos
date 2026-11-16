import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, PieChart } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { ScreenHeader, Logo } from '../components/Shell'
import { EmptyState } from '../components/ui'
import { categoryColor } from '../lib/constants'
import { monthKey, monthLabel, shiftMonth as shiftMonthKey } from '../lib/date'
import { compareCategories, formatCents, totalsByCategory } from '../lib/money'

export function CategoriesScreen() {
  const { allExpenses, totals, totalCents, month, shiftMonth, household, busy, baseCurrency } = useApp()
  const previousMonth = shiftMonthKey(month, -1)

  const ranking = useMemo(
    () => compareCategories(
      totals,
      totalsByCategory(allExpenses.filter((expense) => monthKey(expense.spentOn) === previousMonth)),
    ),
    [totals, allExpenses, previousMonth],
  )

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Tu hogar"
        title="Rubros"
        subtitle={household ? household.name : '¿En qué gastamos?'}
        action={<Logo />}
      />

      <div className="card flex items-stretch overflow-hidden">
        <button
          onClick={() => shiftMonth(-1)}
          className="grid w-11 place-items-center text-muted transition hover:bg-brand-soft/40 hover:text-brand"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex-1 py-3 text-center">
          <p className="font-display text-[17px] font-semibold capitalize leading-tight text-ink">
            {monthLabel(month)}
          </p>
          <p className="text-[11px] text-muted">Total {formatCents(totalCents, baseCurrency)}</p>
        </div>
        <button
          onClick={() => shiftMonth(1)}
          className="grid w-11 place-items-center text-muted transition hover:bg-brand-soft/40 hover:text-brand"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {ranking.length === 0 && !busy ? (
        <div className="mt-4">
          <EmptyState
            icon={<PieChart className="size-6" />}
            title="Sin gastos en este mes"
            description="Cuando registren gastos, vas a ver en qué se va la plata."
          />
        </div>
      ) : (
        <div className="card mt-3 space-y-4 p-4">
          {ranking.map((item) => (
            <div key={item.category}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">{item.category}</span>
                <span className="text-[13px] font-semibold tabular-nums text-ink">
                  {formatCents(item.cents, baseCurrency)} <span className="text-[11px] font-medium text-muted">· {item.percent} %</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${item.percent}%`, backgroundColor: categoryColor(item.category) }}
                />
              </div>
              <p className="mt-1 text-[10.5px] text-muted">
                {item.changePercent === null
                  ? item.previousCents === 0 ? 'Sin gastos el mes anterior' : 'Nuevo respecto del mes anterior'
                  : `${item.changePercent > 0 ? '+' : ''}${item.changePercent} % vs. mes anterior`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
