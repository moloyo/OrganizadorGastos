import { useState, type FormEvent } from 'react'
import type { CurrencyCode, Expense, Recurrence } from '../types'
import {
  ChevronLeft, ChevronRight, Plus, Search, Trash2, Wallet,
} from 'lucide-react'
import { useApp } from '../state/AppContext'
import { ScreenHeader, Logo } from '../components/Shell'
import { Button, EmptyState, Input, Sheet } from '../components/ui'
import { CATEGORIES, categoryColor } from '../lib/constants'
import {
  allocateCents, equalShares, partsFromShares, sharesFromAmounts, sharesFromParts, sharesFromPercents,
  type Parts, type Shares,
} from '../lib/balance'
import { memberIdsOf, memberLabel } from '../lib/members'
import { rememberedCategory, suggestDescriptions } from '../lib/suggestions'
import { baseAmountOf, CURRENCIES, currencySymbol } from '../lib/currency'
import { formatMoney, parseAmountToCents } from '../lib/money'
import { formatShortDate, monthKey, monthLabel, todayISO } from '../lib/date'

function toPercentInputs(shares: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(shares).map(([id, bps]) => [id, String(bps / 100)]))
}

function toAmountInputs(shares: Shares, totalCents: number): Record<string, string> {
  const amounts = allocateCents(totalCents, shares)
  return Object.fromEntries(
    Object.entries(amounts).map(([id, cents]) => [id, amountInputFromCents(cents)]),
  )
}

/** "10,50" para inputs: entero, coma y dos decimales. */
function amountInputFromCents(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

export function ExpensesScreen() {
  const {
    expenses, allExpenses, totalCents, month, shiftMonth, addExpense, updateExpense, deleteExpense,
    household, householdMembers, user, busy, baseCurrency,
  } = useApp()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('EUR')
  const [baseAmount, setBaseAmount] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0])
  const [spentOn, setSpentOn] = useState(todayISO())
  const [note, setNote] = useState('')
  const [payerId, setPayerId] = useState('')
  const [percents, setPercents] = useState<Record<string, string>>({})
  const [parts, setParts] = useState<Parts>({})
  const [participants, setParticipants] = useState<Record<string, boolean>>({})
  const [splitMode, setSplitMode] = useState<'percent' | 'parts' | 'amounts'>('percent')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const memberIds = memberIdsOf(householdMembers, user)
  const editing = editingId ? allExpenses.find((item) => item.id === editingId) : undefined
  const editorIds = [...new Set([
    ...memberIds,
    ...(editing ? [editing.paidBy, ...Object.keys(editing.shares)] : []),
  ])]
  const label = (id: string) => memberLabel(id, householdMembers, user?.id)
  const activeIds = editorIds.filter((id) => participants[id] !== false)
  const effectivePercents = Object.fromEntries(
    editorIds.map((id) => [id, participants[id] === false ? '0' : percents[id] ?? '']),
  )
  const effectiveParts: Parts = Object.fromEntries(
    editorIds.map((id) => [id, participants[id] === false ? 0 : parts[id] ?? 0]),
  )
  const suggestions = suggestDescriptions(allExpenses, description)
  const partsPreview = splitMode === 'parts' ? sharesFromParts(effectiveParts) : null
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? allExpenses
        .filter((expense) => [expense.description, expense.category, expense.note, label(expense.paidBy)]
          .join(' ').toLowerCase().includes(needle))
        .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt))
    : expenses


  function changeDescription(value: string) {
    setDescription(value)
    const remembered = rememberedCategory(allExpenses, value)
    if (remembered) setCategory(remembered)
  }

  function pickSuggestion(suggestion: { description: string; category: string }) {
    setDescription(suggestion.description)
    setCategory(suggestion.category)
  }

  function baseTotalCents(): number {
    return currency === baseCurrency
      ? parseAmountToCents(amount) ?? 0
      : parseAmountToCents(baseAmount) ?? 0
  }

  function currentShares(totalCents: number) {
    if (splitMode === 'amounts') {
      const entered: Record<string, number | null> = {}
      for (const id of activeIds) {
        const raw = amounts[id]?.trim() ?? ''
        entered[id] = raw ? parseAmountToCents(raw) : null
      }
      return sharesFromAmounts(entered, totalCents)
    }
    return splitMode === 'percent'
      ? sharesFromPercents(effectivePercents)
      : sharesFromParts(effectiveParts)
  }

  function toggleParticipant(id: string, participates: boolean) {
    const next = { ...participants, [id]: participates }
    setParticipants(next)
    if (splitMode === 'amounts') {
      setAmounts((prev) => (next[id] ? prev : { ...prev, [id]: '' }))
      setError('')
      return
    }
    const remaining = editorIds.filter((item) => next[item] !== false)
    const even = equalShares(remaining)
    setPercents(toPercentInputs(even))
    setParts(partsFromShares(even))
    setError('')
  }

  function changeSplitMode(mode: 'percent' | 'parts' | 'amounts') {
    const shares = currentShares(baseTotalCents()) ?? equalShares(memberIds)
    if (mode === 'parts') setParts(partsFromShares(shares))
    else if (mode === 'percent') setPercents(toPercentInputs(shares))
    else setAmounts(toAmountInputs(shares, baseTotalCents()))
    setSplitMode(mode)
  }

  function resetForm() {
    setDescription('')
    setAmount('')
    setCurrency(baseCurrency)
    setBaseAmount('')
    setCategory(CATEGORIES[0])
    setSpentOn(todayISO())
    setNote('')
    setError('')
    setPayerId(user?.id ?? memberIds[0] ?? '')
    const even = equalShares(memberIds)
    setPercents(toPercentInputs(even))
    setParts(partsFromShares(even))
    setParticipants(Object.fromEntries(memberIds.map((id) => [id, true])))
    setSplitMode('percent')
    setAmounts({})
    setRecurrence('none')
  }

  function openForm(expense?: Expense) {
    resetForm()
    if (expense) {
      setEditingId(expense.id)
      setDescription(expense.description)
      setAmount(String(expense.amountCents / 100).replace('.', ','))
      setCurrency(expense.currency)
      setBaseAmount(expense.currency === baseCurrency ? '' : String(expense.baseAmountCents / 100).replace('.', ','))
      setCategory(expense.category)
      setSpentOn(expense.spentOn)
      setNote(expense.note)
      setPayerId(expense.paidBy)
      setPercents(toPercentInputs(expense.shares))
      setParts(partsFromShares(expense.shares))
      setAmounts(toAmountInputs(expense.shares ?? {}, baseAmountOf(expense)))
      setParticipants(Object.fromEntries(
        editorIds.map((id) => [id, (expense.shares[id] ?? 0) > 0]),
      ))
      setRecurrence(expense.recurrence ?? 'none')
    } else {
      setEditingId(null)
    }
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setError('')
    setEditingId(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cents = parseAmountToCents(amount)
    if (!description.trim()) { setError('Poné una descripción.'); return }
    if (cents === null) { setError('Poné un monto válido (ej. 1250,50).'); return }
    const converted = currency === baseCurrency ? cents : parseAmountToCents(baseAmount)
    if (converted === null) { setError(`Poné el equivalente en ${baseCurrency}.`); return }
    if (!payerId) { setError('Elegí quién pagó.'); return }
    if (activeIds.length === 0) { setError('Elegí al menos una persona que participe.'); return }
    if (splitMode === 'amounts') {
      const invalid = editorIds.some((id) => {
        if (participants[id] === false) return false
        const raw = amounts[id]?.trim() ?? ''
        return Boolean(raw) && parseAmountToCents(raw) === null
      })
      if (invalid) { setError('Poné importes válidos (ej. 1250,50).'); return }
    }
    const shares = currentShares(converted)
    if (!shares) {
      setError(splitMode === 'percent'
        ? 'El reparto tiene que sumar exactamente 100 %.'
        : splitMode === 'parts'
          ? 'Poné al menos una parte entera y mayor que cero.'
          : `La suma de los importes no puede superar el total del gasto (${formatMoney(converted, baseCurrency)}).`)
      return
    }
    const input = {
      description,
      amountCents: cents,
      category,
      spentOn,
      note: note.trim(),
      paidBy: payerId,
      shares,
      currency,
      baseAmountCents: converted,
      recurrence,
    }
    if (editingId) await updateExpense(editingId, input)
    else await addExpense(input)
    setOpen(false)
    setEditingId(null)
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
          {formatMoney(totalCents, baseCurrency)}
        </p>

      </div>

      <label className="mt-3 block">
        <span className="sr-only">Buscar gastos</span>
        <span className="flex items-center gap-2 rounded-lg border border-line bg-field px-3">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en todos los meses"
            aria-label="Buscar gastos"
            className="w-full bg-transparent py-2 text-[13px] text-ink placeholder:text-muted/60 focus:outline-none"
          />
        </span>
      </label>
      {needle && (
        <p className="mt-1.5 px-1 text-[10.5px] text-muted">
          {shown.length} resultado{shown.length === 1 ? '' : 's'} en todos los meses
        </p>
      )}

      <Button className="mt-3 w-full" onClick={() => openForm()}>
        <Plus className="size-4" />
        Agregar gasto
      </Button>

      {shown.length === 0 && !busy ? (
        <div className="mt-4">
          <EmptyState
            icon={<Wallet className="size-6" />}
            title="Todavía no hay gastos"
            description="Sumá el primero y vas a ver el total del mes al instante."
            action={
              <Button size="sm" onClick={() => openForm()}>
                <Plus className="size-3.5" /> Agregar gasto
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card mt-4 divide-y divide-line overflow-hidden">
          {shown.map((expense) => (
            <div key={expense.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => openForm(expense)}
                aria-label={`Editar ${expense.description}`}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor(expense.category) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{expense.description}</p>
                  <p className="mt-0.5 text-[10.5px] text-muted">
                    {needle && `${monthKey(expense.spentOn)} · `}{formatShortDate(expense.spentOn)} · {expense.category} · pagó {label(expense.paidBy)}
                    {expense.recurrence === 'monthly' ? ' · mensual' : ''}
                    {expense.note ? ` · ${expense.note}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-right text-[13.5px] font-semibold tabular-nums text-ink">
                  {formatMoney(expense.amountCents, expense.currency)}
                  {expense.currency !== baseCurrency && (
                    <span className="block text-[10.5px] font-normal text-muted">
                      ≈ {formatMoney(expense.baseAmountCents, baseCurrency)}
                    </span>
                  )}
                </span>
              </button>
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
        title={editingId ? 'Editar gasto' : 'Nuevo gasto'}
        subtitle="Se comparte con todo tu hogar"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={close}>Cancelar</Button>
            <Button type="submit" form="gasto-form" className="flex-1">
              {editingId ? 'Guardar cambios' : 'Guardar'}
            </Button>
          </div>
        }
      >
        <form id="gasto-form" onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Descripción</span>
            <Input
              value={description}
              onChange={(event) => changeDescription(event.target.value)}
              placeholder="Ej.: Verdulería"
              autoFocus
              autoComplete="off"
            />
          </label>
          {suggestions.length > 0 && (
            <div className="-mt-1 flex flex-wrap gap-1.5" aria-label="Sugerencias">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.description}
                  type="button"
                  onClick={() => pickSuggestion(suggestion)}
                  className="rounded-full border border-line bg-field px-2.5 py-1 text-[11.5px] font-medium text-ink transition hover:border-brand hover:text-brand"
                >
                  {suggestion.description}
                  <span className="ml-1.5 text-muted">{suggestion.category}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Monto</span>
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="1250,50"
                inputMode="decimal"
                aria-label="Monto"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Moneda</span>
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                className="w-full rounded-lg border border-line bg-field px-2 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
                aria-label="Moneda"
              >
                {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.symbol} {item.code}</option>)}
              </select>
            </label>
          </div>
          {currency !== baseCurrency && (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Equivalente en {baseCurrency} ({currencySymbol(baseCurrency)})
              </span>
              <Input
                value={baseAmount}
                onChange={(event) => setBaseAmount(event.target.value)}
                placeholder="1250,50"
                inputMode="decimal"
                aria-label={`Equivalente en ${baseCurrency}`}
              />
              <span className="mt-1 block text-[10.5px] text-muted">
                Los totales y el saldo se calculan con este valor.
              </span>
            </label>
          )}
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
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Repetir</span>
            <select
              value={recurrence}
              onChange={(event) => setRecurrence(event.target.value as Recurrence)}
              className="w-full rounded-lg border border-line bg-field px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
              aria-label="Repetir"
            >
              <option value="none">Sólo una vez</option>
              <option value="monthly">Todos los meses (12)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Pagó</span>
            <select
              value={payerId}
              onChange={(event) => setPayerId(event.target.value)}
              className="w-full rounded-lg border border-line bg-field px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none"
              aria-label="Pagó"
            >
              {editorIds.map((id) => <option key={id} value={id}>{label(id)}</option>)}
            </select>
          </label>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Reparto</span>
              <button
                type="button"
                onClick={() => {
                  const even = equalShares(activeIds)
                  if (splitMode === 'amounts') setAmounts(toAmountInputs(even, baseTotalCents()))
                  else if (splitMode === 'parts') setParts(partsFromShares(even))
                  else { setPercents(toPercentInputs(even)); setParts(partsFromShares(even)) }
                }}
                className="text-[11px] font-semibold text-brand hover:underline"
              >
                Repartir por igual
              </button>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-field p-1">
              {(['percent', 'parts', 'amounts'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeSplitMode(mode)}
                  aria-pressed={splitMode === mode}
                  className={`rounded-md py-1.5 text-[11.5px] font-semibold transition ${
                    splitMode === mode ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                >
                  {mode === 'percent' ? 'Por porcentaje' : mode === 'parts' ? 'Por partes' : 'Por importes'}
                </button>
              ))}
            </div>
            {splitMode === 'amounts' && (
              <p className="mb-2 text-[10.5px] text-muted">
                Ingresá el importe que corresponde a cada persona; el resto del gasto se reparte igual entre quienes no pusieron importe.
              </p>
            )}
            <div className="space-y-2">
              {editorIds.map((id) => (
                <div key={id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={participants[id] !== false}
                    onChange={(event) => toggleParticipant(id, event.target.checked)}
                    aria-label={`${label(id)} participa del gasto`}
                    className="size-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  <span className={`min-w-[4rem] flex-1 truncate text-[13px] ${participants[id] === false ? 'text-muted line-through' : 'text-ink'}`}>
                    {label(id)}
                  </span>
                  <span className="w-24 shrink-0">
                    {splitMode === 'amounts' ? (
                      <Input
                        disabled={participants[id] === false}
                        value={amounts[id] ?? ''}
                        onChange={(event) => setAmounts((prev) => ({ ...prev, [id]: event.target.value }))}
                        inputMode="decimal"
                        className="text-right"
                        aria-label={`Importe de ${label(id)}`}
                        placeholder="—"
                      />
                    ) : (
                      <Input
                        disabled={participants[id] === false}
                        value={splitMode === 'percent' ? percents[id] ?? '' : String(parts[id] ?? '')}
                        onChange={(event) => {
                          const value = event.target.value
                          if (splitMode === 'percent') {
                            setPercents((prev) => ({ ...prev, [id]: value }))
                          } else {
                            setParts((prev) => ({ ...prev, [id]: value === '' ? 0 : Number(value) }))
                          }
                        }}
                        inputMode={splitMode === 'percent' ? 'decimal' : 'numeric'}
                        className="text-right"
                        aria-label={splitMode === 'percent' ? `Porcentaje de ${label(id)}` : `Partes de ${label(id)}`}
                      />
                    )}
                  </span>
                  <span className="w-8 text-[13px] text-muted">
                    {splitMode === 'percent' ? '%' : splitMode === 'parts' ? 'ptas.' : currencySymbol(baseCurrency)}
                  </span>
                </div>
              ))}
            </div>
            {partsPreview && (
              <p className="mt-2 text-[10.5px] text-muted">
                Equivale a {activeIds.map((id) => `${(partsPreview[id] ?? 0) / 100} %`).join(' / ')}
              </p>
            )}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Nota (opcional)</span>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: con descuento" />
          </label>
          {error && <p className="text-[12px] font-medium text-danger-ink">{error}</p>}
        </form>
      </Sheet>
    </div>
  )
}
