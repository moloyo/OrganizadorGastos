import { useState } from 'react'
import { useApp } from '../state/AppContext'
import { Logo } from '../components/Shell'
import { Button, Input } from '../components/ui'

export function ResetPasswordScreen({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { updatePassword, toast } = useApp()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function save() {
    if (password.length < 6) {
      toast('La contraseña necesita al menos 6 caracteres.', 'error')
      return
    }
    setLoading(true)
    try {
      await updatePassword(password)
      toast('Contraseña actualizada.', 'success')
      onDone()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No pudimos cambiar la contraseña.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <Logo size={56} />
        <h1 className="mt-4 font-display text-[26px] font-semibold text-ink">Nueva contraseña</h1>
        <p className="mt-2 text-[12.5px] text-muted">Elegí una contraseña nueva para tu cuenta.</p>
        <div className="card mt-6 space-y-3 p-5 text-left">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Al menos 6 caracteres"
            autoFocus
          />
          <Button className="w-full" loading={loading} onClick={() => void save()}>
            Guardar contraseña
          </Button>
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            Volver al ingreso
          </Button>
        </div>
      </div>
    </div>
  )
}
