import { useState, type FormEvent } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Wallet,
} from 'lucide-react'
import { useApp } from '../state/AppContext'
import { ScreenHeader, Logo } from '../components/Shell'
import { Button, EmptyState, Input, Sheet } from '../components/ui'
import { CATEGORIES, categoryColor } from '../lib/constants'
import { formatCents, parseAmountToCents } from '../lib/money'
import { formatShortDate, monthLabel, todayISO } from '../lib/date'

export function ExpensesScreen() {
  const { expenses, totalCents, totals, month, shiftMonth, addExpense, deleteExpense, household, busy } = useApp()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0])
  const [spentOn, setSpentOn] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function close() {
    setOpen(false)
    setDescription('')
    setAmount('')
    setCategory(CATEGORIES[0])
    setSpentOn(todayISO())
    setNote('')
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cents = parseAmountToCents(amount)
    if (!description.trim()) { setError('Poné una descripción.'); return }
    if (cents === null) { setError('Poné un monto válido (ej. 1250,50).'); return }
    await addExpense(description, cents, category, spentOn, note.trim())
    close()
  }

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Tu hogar"
        title="Gastos"
        subtitle={household ? household.name : 'Registrá lo que gastan'}
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
          <p className="text-[11px] text-muted">{expenses.length} gasto{expenses.length === 1 ? '' : 's'}</p>
        </div>
        <button
          onClick={() => shiftMonth(1)}
          className="grid w-11 place-items-center text-muted transition hover:bg-brand-soft/40 hover:text-brand"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="card mt-3 p-4">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted">Total del mes</p>
        <p className="mt-1 font-display text-[30px] font-semibold leading-none text-ink">
          {formatCents(totalCents)}
        </p>
        {totals.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {totals.map((item) => (
              <span
                key={item.category}
                className="rounded-full px-2 py-1 text-[10.5px] font-semibold"
                style={{ backgroundColor: `color-mix(in srgb, ${categoryColor(item.category)} 14%, transparent)`, color: categoryColor(item.category) }}
              >
                {item.category} · {formatCents(item.cents)}
              </span>
            ))}
          </div>
        )}
      </div>

      <Button className="mt-3 w-full" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Agregar gasto
      </Button>

      {expenses.length === 0 && !busy ? (
        <div className="mt-4">
          <EmptyState
            icon={<Wallet className="size-6" />}
            title="Todavía no hay gastos"
            description="Sumá el primero y vas a ver el total del mes al instante."
            action={
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="size-3.5" /> Agregar gasto
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card mt-4 divide-y divide-line overflow-hidden">
          {expenses.map((expense) => (
            <div key={expense.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor(expense.category) }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">{expense.description}</p>
                <p className="mt-0.5 text-[10.5px] text-muted">
                  {formatShortDate(expense.spentOn)} · {expense.category}
                  {expense.note ? ` · ${expense.note}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-ink">
                {formatCents(expense.amountCents)}
              </span>
              <button
                onClick={() => void deleteExpense(expense.id)}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger-ink"
                aria-label={`Eliminar ${expense.description}`}
                title="Eliminar"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={close}
        title="Nuevo gasto"
        subtitle="Se comparte con todo tu hogar"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={close}>Cancelar</Button>
            <Button type="submit" form="gasto-form" className="flex-1">Guardar</Button>
          </div>
        }
      >
        <form id="gasto-form" onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Descripción</span>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ej.: Verdulería"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Monto</span>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="1250,50"
              inputMode="decimal"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Rubro</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full rounded-lg border border-line bg-field px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
                aria-label="Rubro"
              >
                {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Fecha</span>
              <Input type="date" value={spentOn} onChange={(event) => setSpentOn(event.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Nota (opcional)</span>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: pagó ella" />
          </label>
          {error && <p className="text-[12px] font-medium text-danger-ink">{error}</p>}
        </form>
      </Sheet>
    </div>
  )
}
