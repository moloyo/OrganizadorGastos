export type ThemeId = 'clasico' | 'cool' | 'oscuro'

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
    label: 'Oscuro',
    hint: 'Para la noche',
    themeColor: '#0F1512',
    preview: { background: '#0F1512', surface: '#17201B', brand: '#5DB98D', accent: '#E98A5D' },
  },
]

const KEY = 'gastos:theme'

export function readTheme(): ThemeId {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'cool' || value === 'oscuro' ? value : 'clasico'
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
