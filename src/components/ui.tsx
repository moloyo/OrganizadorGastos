import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../state/AppContext'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand shadow-[0_6px_16px_-8px_rgba(47,106,79,0.8)] hover:bg-brand-dark active:scale-[0.98]',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-brand/50 hover:bg-brand-soft/40 active:scale-[0.98]',
  ghost: 'text-muted hover:text-ink hover:bg-ink/5 active:scale-[0.98]',
  soft: 'bg-brand-soft text-brand-dark hover:bg-brand-soft/70 active:scale-[0.98]',
  danger: 'bg-danger-soft text-danger-ink hover:bg-danger-soft/70 active:scale-[0.98]',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
  icon: 'h-10 w-10 rounded-xl justify-center',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export function Button({
  variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant], SIZES[size], className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Input({
  className, ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full rounded-lg border border-line bg-field px-3 py-2 text-[13px] text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none',
        className,
      )}
    />
  )
}

export function Sheet({
  open, onClose, title, subtitle, footer, children, wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  footer?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'animate-rise relative w-full rounded-t-3xl border border-line bg-surface p-5 shadow-[var(--shadow-float)] sm:rounded-3xl',
          wide ? 'sm:max-w-lg' : 'sm:max-w-sm',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11.5px] text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-cream hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-4 max-h-[60vh] overflow-y-auto">{children}</div>
        {footer && <div className="mt-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function EmptyState({
  icon, title, description, action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-cream/40 px-5 py-9 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</span>
      <p className="mt-1 text-[14px] font-semibold text-ink">{title}</p>
      <p className="max-w-[18rem] text-[12px] leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Toaster() {
  const { toasts, dismissToast } = useApp()
  if (toasts.length === 0) return null
  return createPortal(
    <div className="fixed inset-x-0 top-3 z-[60] mx-auto flex w-full max-w-sm flex-col gap-2 px-4">
      {toasts.map((item) => (
        <button
          key={item.id}
          onClick={() => dismissToast(item.id)}
          className={clsx(
            'animate-rise rounded-xl border px-3.5 py-2.5 text-left text-[12.5px] font-medium shadow-[var(--shadow-float)]',
            item.tone === 'error'
              ? 'border-danger-border bg-danger-soft text-danger-ink'
              : item.tone === 'success'
                ? 'border-success-border bg-success-soft text-success-ink'
                : 'border-line bg-surface text-ink',
          )}
        >
          {item.message}
        </button>
      ))}
    </div>,
    document.body,
  )
}
