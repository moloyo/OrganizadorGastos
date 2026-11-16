import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Plus, Scale, Trash2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import type { Transfer } from '../types'
import { makeId } from '../lib/adapters'
import { formatCents, parseAmountToCents } from '../lib/money'
import { todayISO } from '../lib/date'
import { ScreenHeader, Logo } from '../components/Shell'
import { Button, EmptyState, Input, Sheet } from '../components/ui'
import { overallSummary } from '../lib/balance'
import { memberIdsOf, memberLabel } from '../lib/members'

export function SaldoScreen() {
  const {
    allExpenses, household, householdMembers, user, busy, baseCurrency,
    transfers, addTransfer, deleteTransfer, activeTripId,
  } = useApp()
  const memberIds = useMemo(() => memberIdsOf(householdMembers, user), [householdMembers, user])
  const summary = useMemo(
    () => overallSummary(allExpenses, memberIds, transfers),
    [allExpenses, memberIds, transfers],
  )
  const label = (id: string) => memberLabel(id, householdMembers, user?.id)

  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function openForm() {
    setFrom(memberIds.find((id) => id !== user?.id) ?? user?.id ?? '')
    setTo(user?.id ?? memberIds[0] ?? '')
    setAmount('')
    setNote('')
    setError('')
    setOpen(true)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cents = parseAmountToCents(amount)
    if (!from || !to || from === to) { setError('Elegí quién paga y quién recibe.'); return }
    if (cents === null || cents === 0) { setError('Poné un monto válido.'); return }
    const transfer: Transfer = {
      id: makeId(), from, to, amountCents: cents, currency: baseCurrency,
      baseAmountCents: cents, note: note.trim(), paidOn: todayISO(),
      tripId: activeTripId, createdAt: new Date().toISOString(),
    }
    await addTransfer(transfer)
    setOpen(false)
  }

  const people = useMemo(
    () => [...new Set([...memberIds, ...Object.keys(summary.balances)])],
    [memberIds, summary.balances],
  )

  function describeSettlement(fromId: string, toId: string, cents: number): string {
    const amount = formatCents(cents, baseCurrency)
    if (fromId === user?.id) return `Vos le pagás ${amount} a ${label(toId)}`
    if (toId === user?.id) return `${label(fromId)} te paga ${amount}`
    return `${label(fromId)} le paga ${amount} a ${label(toId)}`
  }

  return (
    <div className="animate-rise">
      <ScreenHeader
        eyebrow="Tu hogar"
        title="Saldo"
        subtitle="Desde el principio · incluye todos los meses"
        action={<Logo />}
      />

      <div className="card p-4">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted">Total gastado</p>
        <p className="mt-1 font-display text-[30px] font-semibold leading-none text-ink">
          {formatCents(summary.totalCents, baseCurrency)}
        </p>
        <p className="mt-2 text-[10.5px] text-muted">
          {household ? household.name : 'Todos los gastos del hogar'}
        </p>
      </div>

      <Button className="mt-3 w-full" onClick={openForm}>
        <Plus className="size-4" /> Registrar pago
      </Button>

      {summary.totalCents === 0 && transfers.length === 0 && !busy ? (
        <div className="mt-4">
          <EmptyState
            icon={<Scale className="size-6" />}
            title="Todavía no hay gastos"
            description="Cuando registren gastos, vas a ver quién pagó y cuánto se deben."
          />
        </div>
      ) : (
        <>
          <div className="card mt-3 divide-y divide-line overflow-hidden">
            {people.map((id) => {
              const balance = summary.balances[id] ?? 0
              return (
                <div key={id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{label(id)}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted">
                      Pagó {formatCents(summary.paidCents[id] ?? 0, baseCurrency)} · le corresponde {formatCents(summary.owedCents[id] ?? 0, baseCurrency)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {balance === 0 ? (
                      <p className="text-[12.5px] font-semibold text-muted">Al día</p>
                    ) : (
                      <>
                        <p className={`text-[13.5px] font-semibold tabular-nums ${balance > 0 ? 'text-brand' : 'text-danger-ink'}`}>
                          {balance > 0 ? '+' : '−'} {formatCents(Math.abs(balance), baseCurrency)}
                        </p>
                        <p className="text-[10.5px] text-muted">{balance > 0 ? 'le deben' : 'debe'}</p>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="card mt-3 p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted">Para quedar a mano</p>
            {summary.settlements.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink">Están a mano: no hay nada que pagar.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {summary.settlements.map((settlement) => (
                  <li key={`${settlement.from}-${settlement.to}`} className="flex items-center gap-2 text-[13px] text-ink">
                    <ArrowRight className="size-4 shrink-0 text-brand" />
                    <span>{describeSettlement(settlement.from, settlement.to, settlement.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {transfers.length > 0 && (
            <div className="card mt-3 divide-y divide-line overflow-hidden">
              <p className="px-4 pb-2 pt-3 text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted">Pagos registrados</p>
              {transfers.map((transfer) => (
                <div key={transfer.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] text-ink">
                      {label(transfer.from)} → {label(transfer.to)} · {formatCents(transfer.baseAmountCents, baseCurrency)}
                    </p>
                    <p className="text-[10.5px] text-muted">{transfer.paidOn}{transfer.note ? ` · ${transfer.note}` : ''}</p>
                  </div>
                  <button
                    onClick={() => void deleteTransfer(transfer.id)}
                    aria-label="Eliminar pago"
                    className="grid size-7 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger-ink"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar pago"
        subtitle="Anotá un pago entre ustedes"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="pago-form" className="flex-1">Guardar</Button>
          </div>
        }
      >
        <form id="pago-form" onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Quién paga</span>
              <select value={from} onChange={(event) => setFrom(event.target.value)}
                className="w-full rounded-lg border border-line bg-field px-3 py-2 text-[13px] text-ink" aria-label="Quién paga">
                {memberIds.map((id) => <option key={id} value={id}>{label(id)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Quién recibe</span>
              <select value={to} onChange={(event) => setTo(event.target.value)}
                className="w-full rounded-lg border border-line bg-field px-3 py-2 text-[13px] text-ink" aria-label="Quién recibe">
                {memberIds.map((id) => <option key={id} value={id}>{label(id)}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Monto ({baseCurrency})</span>
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="8000,00" inputMode="decimal" aria-label="Monto del pago" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Nota (opcional)</span>
            <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej.: transferencia" />
          </label>
          {error && <p className="text-[12px] font-medium text-danger-ink">{error}</p>}
        </form>
      </Sheet>
    </div>
  )
}
