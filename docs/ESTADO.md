# Estado del proyecto

**16 de noviembre de 2026**

## Resumen

**Scaffold funcional con infraestructura completa y dominio de gastos mínimo a propósito.** Auth, hogares compartidos, offline, Realtime, temas, PWA y tests están armados. Lo que NO está: **no se tocó Supabase, no se aplicó ninguna migración, no se hizo deploy y no hay git remoto**. El login y la UI funcionan en modo local de test; para producción faltan las variables de entorno y `npm run db:push`.

Contexto: [README.md](../README.md) · [DESARROLLO.md](DESARROLLO.md) · [KIT-REUTILIZABLE.md](KIT-REUTILIZABLE.md).

## Qué está hecho

| Sección | Estado |
| --- | --- |
| **Base técnica** | React 19 + TS + Vite 8 + Tailwind v4 (`@theme` en `src/index.css`), `package.json`, `vitest.config.ts`, `vercel.json`, `supabase/config.toml` |
| **Auth** | `AuthScreen.tsx`, `ResetPasswordScreen.tsx`, `src/lib/recovery.ts`, Gate de sesión/recovery en `src/App.tsx`, métodos `signIn`/`signUp`/`signOut`/`resetPassword`/`updatePassword`/`deleteAccount` en el `DataAdapter` |
| **Hogares** | `households`, `household_members`, `household_invites`, los 9 métodos de hogar del adapter, `src/lib/household.ts`, `src/lib/invite.ts`, `InviteScreen.tsx` |
| **Gastos** | `ExpensesScreen.tsx`, `SettingsScreen.tsx`, `expenses` con `amount_cents integer`, `src/types.ts`, `src/lib/money.ts`, `src/lib/date.ts`, alta/borrado/export e import por `DataAdapter` |
| **Offline** | `src/lib/adapters/offline.ts`, caché `gastos:cache:v1:<householdId>:expenses`, cola `gastos:queue:v1:<householdId>`, `isOfflineError`, `flush`, `rescope` |
| **Realtime** | Broadcast en `gastos:hh:<householdId>`, señal sin datos, debounce 350 ms y `shouldRefreshFromRealtime()` en `AppContext.tsx` |
| **Temas** | Clásico / cool / oscuro por variables CSS en `<html data-theme>`, clave `gastos:theme`, aplicados en `src/main.tsx` antes del primer render |
| **PWA** | Manifest + íconos, `registerType: 'autoUpdate'`, `HashRouter`, `sw.js` con `Cache-Control: public, max-age=0, must-revalidate` en `vercel.json` |
| **Tests** | Vitest (`tests/*.test.ts` + `tests/migrations.test.mjs`) y Playwright (`tests/e2e/*.spec.ts`, `envDir = tests/e2e/env`, puerto 5175) |
| **Docs** | Este archivo, [README.md](../README.md), [DESARROLLO.md](DESARROLLO.md) y [KIT-REUTILIZABLE.md](KIT-REUTILIZABLE.md) |

> "Hecho" = código y scaffold listos. La migración `supabase/migrations/20261116000000_schema.sql` **no se aplicó** a ninguna base.

## Decisiones tomadas

| # | Decisión | Por qué / dónde |
| --- | --- | --- |
| 1 | Dinero en `amount_cents integer` (centavos), nunca float | Evita errores de punto flotante; `src/types.ts` (`amountCents`), `src/lib/money.ts` |
| 2 | **Un hogar por usuario** | `my_household` / `ensure_household`; simplifica RLS y caché |
| 3 | **RLS por membresía** con `is_household_member(uuid)` `security definer` | Corta la recursión infinita de policies autorreferentes; migración |
| 4 | `created_by` **sin FK** a `auth.users` (pero `household_members.user_id` sí la tiene) | Borrar una cuenta no destruye los datos compartidos del hogar; el borrado pasa por `delete_my_account` |
| 5 | **Realtime Broadcast**, no `postgres_changes` | Sin SQL extra de publicación y sin filtrar rows de otro hogar; `src/lib/realtime.ts` |
| 6 | Debounce de **350 ms** + `shouldRefreshFromRealtime()` | No pisar la cola offline con una relectura; `AppContext.tsx` |
| 7 | **Migraciones versionadas** + baseline para bases migradas a mano | `supabase/migrations/`, `migration repair --status applied`, `npm run db:push` |
| 8 | Tres modos explícitos `cloud` / `e2e-local` / `unconfigured` | `src/lib/appMode.ts`; sin credenciales → `ConfigMissing` |
| 9 | Modo local **solo** para E2E (`--mode e2e` + `VITE_E2E_LOCAL=1`) | Nunca un modo local para usuarios reales |
| 10 | `HashRouter` | Deep links sin rewrites en Vercel; invitaciones por hash |
| 11 | Caché y cola **prefijadas por `householdId`** + `rescope` | Cambiar de hogar no mezcla datos |
| 12 | Solo errores de red se encolan (`isOfflineError`) | Un 403 de RLS o un `null value in column` es un bug, no offline |
| 13 | Temas por variables CSS aplicadas **pre-render** | Sin destello del tema por defecto; `src/main.tsx`, `src/lib/theme.ts` |
| 14 | PWA `autoUpdate` + `sw.js` con `Cache-Control: public, max-age=0, must-revalidate` | Que el service worker nuevo llegue de verdad |
| 15 | Invitaciones en el hash + `sessionStorage` | El token sobrevive al login; `captureInvite()` en `src/main.tsx` |
| 16 | `.env.local` gitignored, `.env.example` de plantilla; env de Vercel en build time | `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` |
| 17 | Dominio de gastos **mínimo** a propósito | Los 20 platos/rubros del proyecto anterior NO aplican acá |
| 18 | Un solo `DataAdapter` con `offline?` opcional | La UI no conoce Supabase; `src/types.ts`, `src/lib/adapters/` |

## Verificado hasta ahora

Sólo entorno local, sin Supabase real:

- `npm test` — **40/40** Vitest en 10 archivos (`tests/*.test.ts` + `tests/migrations.test.mjs`).
- `npm run build` — build de producción, `tsc -b` limpio, PWA con 25 archivos precacheados.
- `npm run test:e2e` — **2/2** Playwright en modo local (Chrome, puerto 5175): alta de gasto,
  persistencia tras recargar, borrado y cambio de tema.
- `npm run db:migrations` — lista y valida la migración versionada.

**NO verificado todavía** (no lo des por hecho):

- Ninguna corrida contra un proyecto Supabase real: **no se aplicó la migración**.
- Ningún deploy a Vercel.
- Ninguna prueba con dos cuentas reales, recovery real, instalación de PWA sobre HTTPS público, ni cola offline en celular.

## Limitaciones conocidas

- Dominio de gastos mínimo: **sin presupuestos, sin reportes, sin categorías custom, sin exportar CSV, sin adjuntos de ticket, sin moneda/configuración por hogar**.
- Un hogar por usuario.
- Sin credenciales no hay app: `ConfigMissing` es la única salida, no existe modo local de uso real.
- **Sin Supabase aplicado, sin deploy, sin Redirect URLs configuradas y sin git remoto.**
- Cola offline no probada en celular ni contra cortes de red reales.
- Recovery y PWA instalable sin verificar sobre dominio público.
- **`household_join` mueve TODOS los gastos del hogar origen al destino.** Es
  correcto para una cuenta nueva (hogar vacío), pero si alguien con datos deja un
  hogar con otros miembros para unirse a otro, esos gastos compartidos dejan de
  ser visibles para quienes quedaron. Definir la regla (mover / copiar / dejar)
  antes de producción.
- `VITE_E2E_LOCAL=1` sólo sirve con `--mode e2e`; no es un atajo para desarrollo normal.

## Pendientes priorizados

**P0 — antes de que esto sea usable**

1. Definir `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env.local` y aplicar la migración: `npx supabase login` → `npx supabase link --project-ref <ref>` → `npm run db:status` → `npm run db:dry` → `npm run db:push`.
2. Configurar Vercel (variables para Production **y** Preview) + Redirect URLs de Supabase (`https://<dominio>/**`).
3. Verificar con **DOS cuentas temporales**: hogar, invitación, gasto desde cada una, datos intactos al borrar una cuenta, consola limpia.

**P1**

- Presupuestos por categoría/mes.
- Reportes por mes.
- Categorías custom por hogar.

**P2**

- Exportar CSV.
- Adjuntos de ticket.
- Moneda y configuración por hogar.

## Pendientes acordados (noviembre 2026)

- **Notificaciones con la app cerrada (Web Push).** Hoy el campanito funciona siempre y el aviso del navegador sólo con la pestaña abierta. Para avisar con la app cerrada:
  1. Generar el par VAPID con `npx web-push generate-vapid-keys`. La clave pública va a Vercel como `VITE_VAPID_PUBLIC_KEY` (se lee en build); la privada va como secreto de la Edge Function de Supabase, **nunca** al frontend.
  2. Agregar el handler `push` en `public/sw.js` (vite-plugin-pwa ya genera el service worker): `self.addEventListener('push', event => ...)` mostrando `event.notification` con título "Nuevo gasto del hogar" y el cuerpo con descripción y monto.
  3. Crear la tabla `push_subscriptions (user_id uuid, endpoint text, keys jsonb, created_at timestamptz)` con RLS "sólo el propio usuario", y guardar ahí el resultado de `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <clave pública> })`.
  4. Crear una Edge Function `send-push` que lea las `notifications` nuevas y envíe a las suscripciones de ese `user_id`. Dispararla desde un trigger `pg_net` sobre `notifications` (o con un cron si se prefiere agrupar).
  5. Reutilizar el permiso que ya se pide en `Ajustes → Notificaciones`: cuando se conceda, suscribir al service worker y persistir la suscripción; si se revoca, borrarla.
  6. Verificar con las dos cuentas de prueba, con la app cerrada y en HTTPS (Vercel ya lo da). Confirmar que `sw.js` se sirve con `Cache-Control: public, max-age=0, must-revalidate` (ya está en `vercel.json`) para que el service worker nuevo llegue a los dispositivos.

## Cómo retomar

1. Leé este archivo y [DESARROLLO.md](DESARROLLO.md) (retomar en 5 minutos).
2. `npm install`; completá `.env.local` desde `.env.example`.
3. Arranquá el P0 en orden: link, `db:status`, `db:dry`, `db:push`.
4. `npm run dev` y verificá con dos cuentas antes de desplegar.
5. Recién ahí Vercel + Redirect URLs.
6. Para copiar patrones o resolver un síntoma: [KIT-REUTILIZABLE.md](KIT-REUTILIZABLE.md) (secciones 11 y 12).

## Bitácora

- `2026-11-16 · Scaffold inicial`
- `2026-11-20 · Notificaciones de gastos en el hogar + Web Push pendiente`
