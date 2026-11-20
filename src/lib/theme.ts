export type ThemeId = 'clasico' | 'cool' | 'oscuro' | 'gatitos'

export interface ThemeMeta {
  id: ThemeId
  label: string
  hint: string
  themeColor: string
  preview: { background: string; surface: string; brand: string; accent: string }
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'clasico',
    label: 'Clásico',
    hint: 'Cálido, verde',
    themeColor: '#2F6A4F',
    preview: { background: '#FAF6EF', surface: '#FFFFFF', brand: '#2F6A4F', accent: '#D9763D' },
  },
  {
    id: 'cool',
    label: 'Cool',
    hint: 'Claro, azul',
    themeColor: '#2563EB',
    preview: { background: '#EEF3FA', surface: '#FFFFFF', brand: '#2563EB', accent: '#0D9488' },
  },
  {
    id: 'oscuro',
    label: 'Neón',
    hint: 'Cyberpunk, de noche',
    themeColor: '#07070F',
    preview: { background: '#07070F', surface: '#0D0E1C', brand: '#00F0FF', accent: '#FF2E88' },
  },
  {
    id: 'gatitos',
    label: 'Gatitos',
    hint: 'Papel de cuaderno',
    themeColor: '#B9632F',
    preview: { background: '#F4F9FD', surface: '#FFFFFF', brand: '#B9632F', accent: '#4A86BD' },
  },
]

const KEY = 'gastos:theme'

export function readTheme(): ThemeId {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'cool' || value === 'oscuro' || value === 'gatitos' ? value : 'clasico'
  } catch {
    return 'clasico'
  }
}

export function storeTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // sin storage: el cambio igual se aplica en esta sesión
  }
}

export function applyTheme(theme: ThemeId): void {
  if (theme === 'clasico') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
  const meta = THEMES.find((item) => item.id === theme) ?? THEMES[0]
  const tag = document.querySelector('meta[name="theme-color"]')
  if (tag) tag.setAttribute('content', meta.themeColor)
}
