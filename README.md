# OrganizadorGastos

PWA para registrar **gastos compartidos por hogar** (pareja, familia, convivientes). Los miembros de un mismo hogar ven y cargan los mismos gastos.

> **Scaffold inicial.** La infraestructura está lista y el dominio de gastos es mínimo a propósito. Los **20 platos / ejemplos del proyecto anterior (Comidas) NO aplican acá**: no hay recetas, ni rubros de comida, ni planning semanal. Hay un gasto con descripción, monto, categoría, fecha y nota, y nada más.
>
> Estado real: proyecto nuevo, **sin Supabase aplicado, sin migración corrida, sin deploy y sin git remoto**. Mirá [ESTADO.md](docs/ESTADO.md).

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 (`@theme` en `src/index.css`) · `@supabase/supabase-js` · `vite-plugin-pwa` · Vitest · Playwright · Supabase CLI (devDependency) · Vercel.

## Setup en 5 pasos

1. **Cloná el repo / entrá a la carpeta** `OrganizadorGastos`.
2. `npm install`
3. Copiá `.env.example` a `.env.local` (gitignored) y completá las dos variables obligatorias:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   Sin ellas la app muestra **"Falta configurar Supabase"**. No existe modo local para usuarios reales.
4. `npx supabase login` → `npx supabase link --project-ref <ref>` → `npm run db:push`
5. `npm run dev` → puerto **5173**

> `VITE_E2E_LOCAL=1` es exclusivo de Playwright y **solo tiene efecto junto con `--mode e2e`**. No lo pongas en `.env.local`.

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm install` | Instalar dependencias |
| `npm run dev` | Dev server en el puerto **5173** |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E (Playwright, Chrome, puerto **5175**) |
| `npm run build` | Build de producción |
| `npm run preview` | Previsualizar el build |
| `npm run db:status` | Estado de migraciones contra el proyecto linkeado |
| `npm run db:dry` | Simular el push sin aplicar cambios |
| `npm run db:push` | Aplicar migraciones al proyecto linkeado |
| `npm run db:migrations` | Listar migraciones |
| `npx supabase login` | Loguearse en la CLI |
| `npx supabase link --project-ref <ref>` | Vincular el proyecto remoto (una vez por máquina) |
| `npx supabase migration new <nombre>` | Crear una migración nueva |

## Deploy a Vercel

- `vercel.json` fija framework `vite`, build `npm run build` y output `dist`.
- Cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para **Production y Preview**: se leen en tiempo de build, así que cada Preview necesita las suyas.
- En Supabase, configurá las **Redirect URLs** para recovery: `https://<dominio>/**`.
- No hacen falta rewrites: se usa `HashRouter`.
- `sw.js` se sirve con `Cache-Control: public, max-age=0, must-revalidate` para que el service worker no quede viejo.

Orden y checklist completo: [KIT-REUTILIZABLE.md](docs/KIT-REUTILIZABLE.md), sección 11.

## Modelo de datos

Una sola migración: `supabase/migrations/20261116000000_schema.sql`.

| Tabla | Qué guarda |
| --- | --- |
| `households` | El hogar |
| `household_members` | Relación usuario ↔ hogar (`user_id` con FK a `auth.users`; `created_by` de las tablas de datos **sin** FK) |
| `household_invites` | Links de invitación |
| `expenses` | Los gastos del hogar |

**`amount_cents` es `integer` en centavos, nunca float.** En TypeScript el campo se llama `amountCents` (`src/types.ts`); el adapter hace el mapeo a la columna `amount_cents`. El resto del gasto: `description`, `category`, `spentOn`, `note`, `createdAt`.

RLS por membresía con el helper `is_household_member(uuid)` (`security definer`) y RPCs: `my_household`, `ensure_household`, invitaciones, `household_join/leave/rename`, `delete_my_account`.

## Hogar compartido

Un usuario pertenece a **un hogar**. Se entra por invitación (`#/unirse/<token>`); el token sobrevive al login gracias a `captureInvite()` en `src/main.tsx` + `sessionStorage`. Si no hay hogar, `ensure_household` crea uno. Caché y cola offline están **prefijadas por `householdId`**, así que cambiar de hogar no mezcla datos.

## Migraciones versionadas

Todo cambio de schema va a `supabase/migrations/` y se aplica con `npm run db:push`. Para una base ya migrada a mano se usa el baseline (`migration repair --status applied`). Detalle en [KIT-REUTILIZABLE.md](docs/KIT-REUTILIZABLE.md), sección 5, y en `supabase/migrations/README.md`.

## Ideas para seguir

Presupuestos · categorías custom por hogar · reportes por mes · exportar CSV · adjuntos de ticket · moneda y configuración por hogar.

## Más docs

- [DESARROLLO.md](docs/DESARROLLO.md) — retomar en 5 minutos, convenciones y flujos.
- [KIT-REUTILIZABLE.md](docs/KIT-REUTILIZABLE.md) — patrones copiables a cualquier PWA con Supabase + Vercel.
- [ESTADO.md](docs/ESTADO.md) — qué hay, qué falta y prioridades.
