import { useEffect, useState } from 'react'
import { ArrowRight, Link2Off, Loader2, Users } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Logo } from '../components/Shell'
import { Button, Input } from '../components/ui'
import type { InviteInfo } from '../types'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; info: InviteInfo }

export function InviteScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const { household, getInviteInfo, joinHousehold, toast } = useApp()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let alive = true
    void getInviteInfo(token)
      .then((info) => {
        if (!alive) return
        setState(info ? { kind: 'ready', info } : { kind: 'error' })
      })
      .catch(() => { if (alive) setState({ kind: 'error' }) })
    return () => { alive = false }
  }, [token, getInviteInfo])

  async function handleJoin() {
    setJoining(true)
    try {
      await joinHousehold(token)
      onDone()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos unirte al hogar.', 'error')
    } finally {
      setJoining(false)
    }
  }

  const alreadyMember = state.kind === 'ready' && household?.id === state.info.householdId

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Logo size={58} />
          <h1 className="mt-4 font-display text-[30px] font-semibold leading-tight text-ink">Gastos</h1>
          <p className="mt-2 text-[12.5px] text-muted">Te invitaron a compartir un hogar.</p>
        </div>

        <div className="card mt-7 p-5">
          {state.kind === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-7 text-center">
              <Loader2 className="size-6 animate-spin text-brand" />
              <p className="text-[13px] text-muted">Buscando la invitación…</p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="flex flex-col items-center gap-3 py-3 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger-ink">
                <Link2Off className="size-6" />
              </span>
              <p className="text-[14px] font-semibold text-ink">Link no disponible</p>
              <p className="max-w-[16rem] text-[12.5px] leading-relaxed text-muted">
                Esta invitación no existe, fue revocada o venció.
              </p>
              <Button className="mt-2 w-full" onClick={onDone}>
                Ir a la app <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {state.kind === 'ready' && alreadyMember && (
            <div className="flex flex-col items-center gap-3 py-3 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Users className="size-6" />
              </span>
              <p className="text-[13.5px] leading-relaxed text-ink">
                Ya sos parte de <strong className="font-semibold text-brand-dark">{state.info.householdName}</strong>.
              </p>
              <Button className="mt-2 w-full" onClick={onDone}>
                Ir a la app <ArrowRight className="size-4" />
              </Button>
            </div>
          )}

          {state.kind === 'ready' && !alreadyMember && (
            <div>
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Users className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted">
                    Invitación al hogar
                  </p>
                  <h2 className="truncate font-display text-xl font-semibold text-ink">
                    {state.info.householdName}
                  </h2>
                </div>
              </div>
              <dl className="mt-4 space-y-2 rounded-xl bg-cream px-3 py-3 text-[12.5px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted">Miembros</dt>
                  <dd className="font-semibold text-ink">
                    {state.info.memberCount} miembro{state.info.memberCount === 1 ? '' : 's'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted">Vence el</dt>
                  <dd className="font-semibold text-ink">
                    {new Date(state.info.expiresAt).toLocaleDateString('es-AR', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </dd>
                </div>
              </dl>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Código de invitación
                </span>
                <Input value={token} readOnly aria-label="Código de invitación" className="font-mono text-[11.5px]" />
              </label>
              <p className="mt-4 rounded-xl bg-brand-soft/60 px-3 py-2.5 text-[12px] leading-relaxed text-brand-dark">
                Vas a compartir los gastos con ese hogar. Tus gastos actuales se suman al hogar.
              </p>
              <Button className="mt-4 w-full" onClick={() => void handleJoin()} disabled={joining}>
                {joining ? <><Loader2 className="size-4 animate-spin" /> Uniendo…</> : <>Unirme al hogar <ArrowRight className="size-4" /></>}
              </Button>
              <Button variant="ghost" className="mt-1.5 w-full" onClick={onDone} disabled={joining}>
                Ahora no
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
