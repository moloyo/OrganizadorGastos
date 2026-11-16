import { useState, type FormEvent } from 'react'
import { Leaf, Users } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'
import { Logo } from '../components/Shell'
import { Button, Input } from '../components/ui'

export function AuthScreen({ invitePending = false }: { invitePending?: boolean }) {
  const { signIn, signUp, resetPassword } = useApp()
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!email.trim()) { setError('Ingresá tu email.'); return }
    if (mode !== 'forgot' && password.length < 6) {
      setError('La contraseña necesita al menos 6 caracteres.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'forgot') {
        await resetPassword(email.trim())
        setNotice('Si ese email tiene una cuenta, te va a llegar un link para elegir una contraseña nueva.')
        return
      }
      if (mode === 'in') {
        await signIn(email.trim(), password)
      } else {
        const result = await signUp(email.trim(), password)
        if (result.needsConfirmation) {
          setNotice('Te mandamos un email para confirmar la cuenta. Confirmalo y después ingresá.')
          setMode('in')
        } else {
          setNotice('Cuenta creada. Ya podés empezar.')
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos completar la operación.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Logo size={58} />
          <h1 className="mt-4 font-display text-[34px] font-semibold leading-none tracking-tight text-ink">
            Gastos
          </h1>
          <p className="mt-2 max-w-[17rem] text-[13px] leading-relaxed text-muted">
            Los gastos de tu hogar, en un solo lugar.
          </p>
        </div>

        {invitePending && (
          <div
            role="status"
            className="mt-5 flex items-start gap-2 rounded-xl border border-brand/25 bg-brand-soft/60 px-3 py-2.5 text-[11.5px] leading-snug text-ink"
          >
            <Users className="mt-0.5 size-4 shrink-0 text-brand" />
            <span>
              Tenés una invitación para compartir un hogar. Ingresá o creá tu cuenta y
              después te preguntamos si querés unirte.
            </span>
          </div>
        )}

        <div className="card mt-7 p-5">
          {mode === 'forgot' ? (
            <div className="mb-4">
              <p className="text-[13px] font-semibold text-ink">Recuperar contraseña</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                Poné el email de tu cuenta y te mandamos un link para elegir una nueva.
              </p>
            </div>
          ) : (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-cream p-1">
              {(['in', 'up'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setMode(value); setError(''); setNotice('') }}
                  className={clsx(
                    'rounded-lg py-2 text-[12.5px] font-semibold transition',
                    mode === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                  )}
                >
                  {value === 'in' ? 'Ingresar' : 'Crear cuenta'}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Email
              </span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="vos@ejemplo.com"
                autoComplete="email"
              />
            </label>
            {mode !== 'forgot' && (
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Contraseña
                </span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Al menos 6 caracteres"
                  autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                />
              </label>
            )}
            {error && <p className="text-[12px] font-medium text-danger-ink">{error}</p>}
            {notice && <p className="text-[12px] font-medium text-success-ink">{notice}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              {mode === 'forgot' ? 'Mandar link' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-[11.5px]">
            <button
              type="button"
              className="font-semibold text-brand hover:underline"
              onClick={() => { setMode(mode === 'forgot' ? 'in' : 'forgot'); setError(''); setNotice('') }}
            >
              {mode === 'forgot' ? 'Volver al ingreso' : '¿Olvidaste tu contraseña?'}
            </button>
          </div>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1 text-[11px] font-medium text-muted">
          <Leaf className="size-3 text-brand" />
          Solo gastos, sin vueltas
        </p>
      </div>
    </div>
  )
}
