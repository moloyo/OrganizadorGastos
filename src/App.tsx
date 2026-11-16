import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import { appConfigured } from './lib/adapters'
import { Shell, Logo } from './components/Shell'
import { Toaster } from './components/ui'
import { AuthScreen } from './screens/AuthScreen'
import { ResetPasswordScreen } from './screens/ResetPasswordScreen'
import { InviteScreen } from './screens/InviteScreen'
import { ExpensesScreen } from './screens/ExpensesScreen'
import { SaldoScreen } from './screens/SaldoScreen'
import { CategoriesScreen } from './screens/CategoriesScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { clearRecovery, recoveryPending } from './lib/recovery'
import { captureInvite, clearPendingInvite, readPendingInvite } from './lib/invite'

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <div className="animate-pop"><Logo size={56} /></div>
      <p className="font-display text-[22px] font-semibold text-ink">Gastos</p>
      <p className="text-[12px] text-muted">Preparando tu hogar…</p>
    </div>
  )
}

function ConfigMissing() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <Logo size={56} />
        <h1 className="mt-4 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
          Falta configurar Supabase
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          OrganizadorGastos funciona con cuenta: los gastos se guardan en tu
          hogar y se sincronizan entre dispositivos.
        </p>
        <div className="card mt-6 p-4 text-left">
          <p className="text-[12px] font-semibold text-ink">Para levantarla en desarrollo:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11.5px] leading-relaxed text-muted">
            <li>Copiá <code>.env.example</code> a <code>.env.local</code>.</li>
            <li>Completá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.</li>
            <li>
              Aplicá las migraciones: <code>npx supabase link --project-ref &lt;ref&gt;</code> y{' '}
              <code>npm run db:push</code> (o los SQL de <code>supabase/migrations/</code> en orden).
            </li>
            <li>Reiniciá el servidor de desarrollo y creá tu cuenta.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

function Gate() {
  const { ready, loaded, user, isCloud } = useApp()
  const [recovering, setRecovering] = useState(recoveryPending)
  const [inviteToken, setInviteToken] = useState<string | null>(() => readPendingInvite())

  useEffect(() => {
    const onHashChange = () => {
      const token = captureInvite()
      if (token) setInviteToken(token)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function finishRecovery() {
    clearRecovery()
    setRecovering(false)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`)
  }

  function finishInvite() {
    clearPendingInvite()
    setInviteToken(null)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`)
  }

  if (!ready) return <Splash />
  if (isCloud && recovering) {
    return <ResetPasswordScreen onDone={finishRecovery} onCancel={finishRecovery} />
  }
  if (isCloud && !user) return <AuthScreen invitePending={Boolean(inviteToken)} />
  // Evita mostrar "todavía no hay gastos" mientras llegan los datos de la nube.
  if (!loaded) return <Splash />
  if (isCloud && inviteToken) {
    return <InviteScreen token={inviteToken} onDone={finishInvite} />
  }

  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<ExpensesScreen />} />
          <Route path="/gastos" element={<Navigate to="/" replace />} />
          <Route path="/saldo" element={<SaldoScreen />} />
          <Route path="/rubros" element={<CategoriesScreen />} />
          <Route path="/historial" element={<HistoryScreen />} />
          <Route path="/ajustes" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </HashRouter>
  )
}

export default function App() {
  if (!appConfigured) return <ConfigMissing />
  return (
    <AppProvider>
      <Gate />
      <Toaster />
    </AppProvider>
  )
}
