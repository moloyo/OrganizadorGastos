# Desarrollo

## Retomar en 5 minutos

1. Leé [ESTADO.md](ESTADO.md): dice qué hay, qué falta y qué está **pendiente P0**.
2. `npm install`.
3. Copiá `.env.example` a `.env.local` (gitignored) con `VITE_SUPABASE_URL=https://xxxxx.supabase.co` y `VITE_SUPABASE_ANON_KEY=eyJ...`.
4. `npm run dev` → puerto **5173**. Si ves "Falta configurar Supabase", es el modo `unconfigured`, no un bug.
5. Antes de tocar schema: `npm run db:status` y `npm run db:dry`.
6. Patrones y trampas: [KIT-REUTILIZABLE.md](KIT-REUTILIZABLE.md). Volver al [README.md](../README.md).

> Proyecto nuevo: **no se aplicó ninguna migración, no hay deploy ni git remoto**. No lo des por hecho.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 (`@theme` en `src/index.css`) · `@supabase/supabase-js` · `vite-plugin-pwa` · Vitest · Playwright · Supabase CLI (devDependency) · Vercel.

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm install` | Dependencias |
| `npm run dev` | Dev server, puerto **5173** |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright, Chrome, puerto **5175** |
| `npm run build` | Build de producción |
| `npm run preview` | Previsualizar el build |
| `npm run db:status` | Estado de migraciones |
| `npm run db:dry` | Push simulado |
| `npm run db:push` | Aplicar migraciones |
| `npm run db:migrations` | Listar migraciones |
| `npx supabase login` | Login en la CLI |
| `npx supabase link --project-ref <ref>` | Vincular remoto (una vez por máquina) |
| `npx supabase migration new <nombre>` | Nueva migración |

## Modos de datos

`src/lib/appMode.ts` define `cloud`, `e2e-local` y `unconfigured`.

| Modo | Cuándo | Adapter |
| --- | --- | --- |
| `cloud` | Hay `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | `src/lib/adapters/cloud.ts` |
| `e2e-local` | Solo con `--mode e2e` + `VITE_E2E_LOCAL=1` | `src/lib/adapters/local.ts` |
| `unconfigured` | Faltan las variables | Ninguno: pantalla `ConfigMissing` desde el Gate de `src/App.tsx` |

`src/lib/adapters/index.ts` selecciona; `src/lib/adapters/offline.ts` aporta el `offline?: OfflineSupport` (`getStatus`, `subscribe`, `flush`, `rescope`). **No hay modo local para usuarios reales.**

## Schema

Una migración: `supabase/migrations/20261116000000_schema.sql`. Config en `supabase/config.toml` (`project_id = "organizador-gastos"`, `major_version = 15`), flujo en `supabase/migrations/README.md`.

| Tabla | Qué guarda |
| --- | --- |
| `households` | El hogar |
| `household_members` | Usuario ↔ hogar (`user_id` con FK a `auth.users`; las columnas `created_by` de datos **sin** FK) |
| `household_invites` | Links de invitación |
| `expenses` | Gastos, con `amount_cents integer` en centavos |

Helper `is_household_member(uuid)` (`security definer`) + policies por membresía. RPC: `my_household`, `ensure_household`, invitaciones, `household_join/leave/rename`, `delete_my_account`. Tipos en `src/types.ts`: `Expense { id, description, amountCents, category, spentOn, note, createdAt }`, `SessionUser`, `Household`, `HouseholdMember`, `HouseholdInvite`, `InviteInfo`, `OfflineStatus`, `OfflineSupport`, `Snapshot`, `DataAdapter`.

> `amountCents` (TS) se mapea a `amount_cents` (SQL) en el adapter. **Nunca float.**

## Estructura de carpetas

```
OrganizadorGastos/
├── README.md
├── .env.example
├── .env.local                 # gitignored, NO se versiona
├── vercel.json
├── vitest.config.ts
├── package.json
├── docs/
│   ├── KIT-REUTILIZABLE.md
│   ├── DESARROLLO.md
│   └── ESTADO.md
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── README.md
│       └── 20261116000000_schema.sql
├── tests/
│   ├── *.test.ts
│   ├── migrations.test.mjs
│   └── e2e/
│       ├── env/              # envDir de Playwright
│       └── *.spec.ts
└── src/
    ├── main.tsx              # tema antes del render + captureInvite()
    ├── App.tsx               # Gate: sesión / recovery / invitación / HashRouter
    ├── index.css             # @theme de Tailwind v4 + variables de tema
    ├── types.ts
    ├── state/
    │   └── AppContext.tsx
    ├── lib/
    │   ├── appMode.ts
    │   ├── uuid.ts
    │   ├── theme.ts
    │   ├── recovery.ts
    │   ├── invite.ts
    │   ├── household.ts
    │   ├── realtime.ts
    │   ├── money.ts
    │   ├── date.ts
    │   ├── constants.ts
    │   └── adapters/
    │       ├── index.ts
    │       ├── cloud.ts
    │       ├── local.ts
    │       └── offline.ts
    ├── components/
    │   ├── Shell.tsx
    │   ├── ui.tsx
    │   └── ModeChips.tsx
    └── screens/
        ├── AuthScreen.tsx
        ├── ExpensesScreen.tsx
        ├── SettingsScreen.tsx
        ├── InviteScreen.tsx
        └── ResetPasswordScreen.tsx
```

Rutas: `#/`, `#/gastos`, `#/ajustes`, `#/unirse/<token>`.

## Convenciones

- **Español rioplatense** en UI, mensajes y docs. Directo, sin relleno.
- **Tokens CSS** para colores y temas (`src/index.css`, `<html data-theme>`); nada de colores hardcodeados por tema en los componentes.
- **Ids UUID** desde `src/lib/uuid.ts`.
- **Todo acceso a datos pasa por `DataAdapter`** (`src/types.ts`); las screens no hablan con Supabase.
- **Dinero en centavos**: `amountCents` / `amount_cents integer`, helpers en `src/lib/money.ts`; fechas en `src/lib/date.ts`.
- **Un hogar por usuario**: `my_household` / `ensure_household`; caché y cola siempre prefijadas por `householdId`.
- Cambios de schema → `npx supabase migration new <nombre>`, nunca a mano en la base.

## Flujos clave

**Alta de gasto.** `src/screens/ExpensesScreen.tsx` → `src/state/AppContext.tsx` → `saveExpense` del adapter → `src/lib/adapters/cloud.ts` guarda `amount_cents` → `src/lib/realtime.ts` manda Broadcast en `gastos:hh:<householdId>` → el otro cliente relee con debounce de 350 ms.

**Invitación.** `#/unirse/<token>` → `captureInvite()` en `src/main.tsx` (`src/lib/invite.ts`) guarda el token en `sessionStorage` → Gate de `src/App.tsx` lo recupera tras el login → `src/screens/InviteScreen.tsx` → `getHouseholdInviteInfo` / `joinHousehold` (`src/lib/household.ts`).

**Offline.** `isOfflineError` decide: **solo errores de red** van a `gastos:queue:v1:<householdId>`; la lectura sale de `gastos:cache:v1:<householdId>:expenses`. Al volver la red, `flush()`. Al cambiar de hogar, `rescope` de caché y cola (`src/lib/adapters/offline.ts`). Un 403 de RLS **no** se encola.

**Realtime.** Broadcast en `gastos:hh:<householdId>`, señal **sin datos** tras cada escritura exitosa. `shouldRefreshFromRealtime()` en `src/state/AppContext.tsx` evita relecturas que pisen la cola offline.

## Tests

- **Vitest**: `tests/*.test.ts` + `tests/migrations.test.mjs`. `vitest.config.ts` tiene `include` para `.ts` y `.mjs`. Comando `npm test`.
- **Playwright**: `tests/e2e/*.spec.ts`, Chrome instalado, puerto **5175**, `envDir = tests/e2e/env`. Comando `npm run test:e2e`. El modo local se habilita con `VITE_E2E_LOCAL=1` **junto con `--mode e2e`**; no se toca `.env.local`.

## Verificación manual (checklist)

Local, sin Supabase real:

- [ ] Sin `.env.local`, aparece **"Falta configurar Supabase"** y no hay forma de cargar gastos.
- [ ] `npm test` y `npm run build` pasan.
- [ ] `npm run test:e2e` corre el login y la UI en modo local.
- [ ] Cambiar de tema (clásico / cool / oscuro) no produce destello al recargar.
- [ ] Recargar conserva el tema (`gastos:theme`).
- [ ] Los montos se muestran y guardan en centavos, sin decimales raros.
- [ ] Los ids de gastos nuevos son UUID.

Cuando el P0 esté hecho (todavía **no** lo está):

- [ ] Con Supabase linkeado y la migración aplicada, verificar con **dos cuentas temporales**: hogar, invitación, gasto desde cada una, datos intactos al borrar una cuenta.
- [ ] Recovery real con las Redirect URLs configuradas.
- [ ] Instalación de la PWA sobre HTTPS.
- [ ] Cola offline en un celular real.

## Deploy y PWA

`vercel.json`: framework `vite`, build `npm run build`, output `dist`, `Cache-Control: public, max-age=0, must-revalidate` para `sw.js`. Variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` cargadas para **Production y Preview en tiempo de build** (sin rebuild, cambiarlas no hace nada). Redirect URLs de Supabase: `https://<dominio>/**`. `HashRouter` → sin rewrites. `vite-plugin-pwa` con manifest, íconos y `registerType: 'autoUpdate'`. Orden completo en [KIT-REUTILIZABLE.md](KIT-REUTILIZABLE.md), sección 11.

## Problemas comunes

- **"Falta configurar Supabase"**: modo `unconfigured`; revisá `.env.local` y, en Vercel, si hubo rebuild tras cargar las variables.
- **`could not find function my_household`**: no se aplicó la migración o el cliente salió antes. `npm run db:status` → `npm run db:push`.
- **403 al insertar con `household_id` ajeno**: RLS por membresía andando; fijate `my_household` / `ensure_household`.
- **`null value in column`**: falta un campo obligatorio; recordá el mapeo `amountCents` → `amount_cents`.
- **Cola offline que no sincroniza**: el error no era de red, o faltó `flush()` / `rescope`.
- **PWA que no instala**: probando sobre `http://` en la LAN; hace falta HTTPS o localhost.
- **Realtime que no refresca**: canal `gastos:hh:<householdId>` o `shouldRefreshFromRealtime()` bloqueando por cola pendiente.

Tabla completa de 13 síntomas: [KIT-REUTILIZABLE.md](KIT-REUTILIZABLE.md), sección 12.
