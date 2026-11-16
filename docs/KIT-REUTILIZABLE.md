# Kit reutilizable

Patrones destilados del proyecto anterior (Comidas), ya adaptados a **OrganizadorGastos**. Son copiables a cualquier PWA con Supabase + Vercel. Cada sección dice qué problema resuelve, dónde está implementado acá (ruta exacta) y la trampa que te comés si lo hacés de otra manera.

Contexto: [README.md](../README.md) · [DESARROLLO.md](DESARROLLO.md) · [ESTADO.md](ESTADO.md).

---

## 1. Modo de app y cuenta obligatoria

**Problema que resuelve.** Que la app no arranque "como si funcionara" sin backend, y que no haya un modo local escondido que guarde en memoria y haga creer que el gasto se subió.

**Cómo se implementa acá.** `src/lib/appMode.ts` define los tres modos: `cloud`, `e2e-local`, `unconfigured`. El Gate de `src/App.tsx` corta cuando faltan `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` y muestra la pantalla `ConfigMissing` ("Falta configurar Supabase"). Las variables se copian de `.env.example` a `.env.local` (gitignored). `src/lib/adapters/index.ts` elige el adapter según el modo; `src/components/ModeChips.tsx` lo expone en la UI.

**Lección aprendida.** Nunca dejes un *fallback* local silencioso para usuarios reales: si falta config, que se vea claro y feo, no que parezca que anduvo. El modo local existe **solo** junto con `--mode e2e`. Y ojo con Vercel: las `VITE_*` se inlinean en el build, así que una variable cargada después no alcanza.

---

## 2. `DataAdapter` + capa offline

**Problema que resuelve.** Desacoplar la UI del backend y sobrevivir a un corte de red sin perder escrituras ni mezclar datos de otro hogar.

**Cómo se implementa acá.** `src/types.ts` define `DataAdapter` (`getUser`, `onAuthChange`, `subscribeToChanges`, `signIn`, `signUp`, `signOut`, `resetPassword`, `updatePassword`, `deleteAccount`, `listExpenses`, `saveExpense`, `deleteExpense`, `clearExpenses`, `exportAll`, `importAll`, `wipe`, los 9 métodos de hogar y `offline?: OfflineSupport` con `getStatus`, `subscribe`, `flush`, `rescope`). Implementaciones en `src/lib/adapters/{index,cloud,local,offline}.ts`. Caché `gastos:cache:v1:<householdId>:expenses`, cola `gastos:queue:v1:<householdId>`, `isOfflineError`, `flush()` y `rescope` al cambiar de hogar. Orquestación en `src/state/AppContext.tsx`.

**Lección aprendida.** La cola y la caché van **prefijadas por `householdId`** y se *rescopean* al cambiar de hogar; si no, un gasto cargado en el hogar A se termina subiendo al B. Y **solo los errores de red se encolan** (`isOfflineError`): un 403 de RLS o un `null value in column` es un bug, no un "todavía no hay internet". Encolarlo lo escondés y lo repetís para siempre.

---

## 3. RLS por membresía con helper `security definer`

**Problema que resuelve.** Que cada miembro vea únicamente su hogar, sin recursión infinita de policies y sin que borrar una cuenta se lleve puestos los gastos compartidos.

**Cómo se implementa acá.** `supabase/migrations/20261116000000_schema.sql` crea `households`, `household_members`, `household_invites` y `expenses`, el helper `is_household_member(uuid)` marcado `security definer`, las policies por membresía y las RPC (`my_household`, `ensure_household`, invitaciones, `household_join/leave/rename`, `delete_my_account`). Config en `supabase/config.toml`, flujo en `supabase/migrations/README.md`, acceso desde `src/lib/household.ts`.

**Lección aprendida.** Si una policy de `household_members` consulta `household_members` para decidir si el usuario es miembro, RLS se evalúa a sí misma → **recursión infinita**. El helper `security definer` corre con los privilegios de su dueño y corta el ciclo. Ojo con las FK: `household_members.user_id` **sí** tiene FK a `auth.users` con `ON DELETE CASCADE` (queremos que la membresía desaparezca al borrar la cuenta), pero las columnas de autoría (`households.created_by`, `expenses.created_by`, `household_invites.created_by`) **no** la tienen, para que borrar una cuenta no destruya los gastos compartidos. El borrado pasa por `delete_my_account`, que limpia solo los hogares que quedaron vacíos.

---

## 4. Invitaciones por link en el hash + `sessionStorage`

**Problema que resuelve.** El invitado abre el link sin estar logueado, hace sign-in/sign-up, y el token se perdió en el camino.

**Cómo se implementa acá.** Ruta `#/unirse/<token>`. `src/main.tsx` llama `captureInvite()` (`src/lib/invite.ts`) **antes** de renderizar y guarda el token en `sessionStorage`. El Gate de `src/App.tsx` lo recupera después del login (y `ConfigMissing` no se lo come), `src/screens/InviteScreen.tsx` muestra la invitación y `getHouseholdInviteInfo` / `joinHousehold` de `src/lib/household.ts` cierran la operación.

**Lección aprendida.** `sessionStorage` y no `localStorage`: sobrevive al redirect de auth en la misma pestaña y no queda colgado para siempre en la máquina. Y con `HashRouter` el token viaja **dentro del hash**, así que el servidor nunca lo ve y no dependés de rewrites.

---

## 5. Migraciones versionadas con Supabase CLI + baseline

**Problema que resuelve.** Que el schema sea reproducible y que una base ya migrada a mano no vuelva a ejecutar el `CREATE` inicial.

**Cómo se implementa acá.** Migración única `supabase/migrations/20261116000000_schema.sql`; `supabase/config.toml` fija `project_id = "organizador-gastos"` y `major_version = 15`; `supabase/migrations/README.md` documenta el flujo. Comandos: `npm run db:status`, `npm run db:dry`, `npm run db:push`, `npm run db:migrations`, `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase migration new <nombre>`. Para bases ya migradas a mano, el baseline es un comando completo:
`npx supabase migration repair 20261116000000 --status applied --linked` (lo imprime
`npm run db:migrations`). Marca la migración como aplicada sin ejecutarla.

**Lección aprendida.** **No corras `npm run db:push` sobre una base que ya tiene el schema a mano** sin antes marcar el baseline: te va a saltar `relation already exists` / migraciones pendientes en una base que ya está bien. Y siempre `npm run db:dry` antes de `npm run db:push`. El `project_ref` real no se versiona: se vincula una sola vez por máquina con `npx supabase link --project-ref <ref>`.

---

## 6. Realtime Broadcast + debounce + guardia de cola

**Problema que resuelve.** Que el otro miembro vea el gasto nuevo sin polling, sin SQL extra y sin pisar escrituras que todavía están en la cola offline.

**Cómo se implementa acá.** `src/lib/realtime.ts` usa Broadcast en el canal `gastos:hh:<householdId>`. Tras cada escritura exitosa se manda una **señal sin datos**. `src/state/AppContext.tsx` relee con debounce de **350 ms** y `shouldRefreshFromRealtime()` evita refrescar si hay cola pendiente.

**Lección aprendida.** Elegí **Broadcast y no `postgres_changes`**: no hay que agregar la tabla a una publicación (SQL extra) ni filtrar rows de otro hogar que igual te llegaron. La señal no lleva el gasto: quien la recibe **relee por su adapter**, así caché y cola siguen siendo la fuente de verdad. Sin el debounce, tres escrituras seguidas disparan tres relecturas; sin la guardia, un refresh a media sincronización te pisa la cola.

---

## 7. Temas con variables CSS y aplicación pre-render

**Problema que resuelve.** Tres temas (clásico / cool / oscuro) sin el destello del tema por defecto al cargar.

**Cómo se implementa acá.** `src/index.css` define el `@theme` de Tailwind v4 y las variables CSS bajo `<html data-theme>`. `src/lib/theme.ts` lee y escribe la clave `gastos:theme`. `src/main.tsx` aplica el tema **antes** del primer render. `src/components/ModeChips.tsx` lo cambia en caliente.

**Lección aprendida.** Si seteás `data-theme` desde un `useEffect` del primer render, el usuario ve un flash claro/oscuro. Leé `gastos:theme` y aplicá el atributo en `src/main.tsx`, antes de montar el root. Las variables CSS (no clases de Tailwind hardcodeadas por tema) son lo que hace que cambiar de tema no requiera re-render de la app.

---

## 8. PWA instalable

**Problema que resuelve.** Que se pueda instalar y que una versión nueva no quede pegada a un service worker viejo.

**Cómo se implementa acá.** `vite-plugin-pwa` con manifest e íconos, `registerType: 'autoUpdate'`. `vercel.json` manda `Cache-Control: public, max-age=0, must-revalidate` para `sw.js`. `src/App.tsx` usa `HashRouter`, así que los deep links no necesitan rewrites.

**Lección aprendida.** `autoUpdate` no sirve de nada si `sw.js` está cacheado fuerte: el navegador nunca se entera de que hay versión nueva. Y la PWA **solo instala en HTTPS** (o localhost): probar contra `http://` en la LAN no va a mostrar el prompt de instalación.

---

## 9. Vercel

**Problema que resuelve.** Que Production y cada Preview apunten al Supabase correcto y que los deep links funcionen sin configuración extra.

**Cómo se implementa acá.** `vercel.json` fija framework `vite`, build `npm run build`, output `dist`. `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se cargan para **Production y Preview en tiempo de build**. Redirect URLs de Supabase para recovery: `https://<dominio>/**`. `src/App.tsx` con `HashRouter` → cero rewrites.

**Lección aprendida.** Las `VITE_*` se **inlinean en el bundle durante el build**: cambiar la variable sin rebuild no hace nada, y un Preview sin sus propias variables compila un cliente que apunta a otro lado o cae en `unconfigured`. Configurá las Redirect URLs **antes** de probar recovery, no después de que el link falle.

---

## 10. E2E aislado en modo local

**Problema que resuelve.** Correr Playwright sin tocar Supabase, sin credenciales reales y sin contaminar el `.env.local` del desarrollador.

**Cómo se implementa acá.** `tests/e2e/*.spec.ts`, Chrome instalado, servidor en puerto **5175**, `envDir = tests/e2e/env`. `VITE_E2E_LOCAL=1` **solo tiene efecto junto con `--mode e2e`**, que es el modo que fija `npm run test:e2e`. `src/lib/appMode.ts` resuelve `e2e-local` y `src/lib/adapters/local.ts` es el adapter de ese modo. Unit tests aparte: `tests/*.test.ts` + `tests/migrations.test.mjs` con `vitest.config.ts`.

**Lección aprendida.** **Nunca** pongas `VITE_E2E_LOCAL=1` en `.env.local`: el día que alguien lo habilite sin querer, aparece un modo local en producción. El aislamiento va por `envDir` y los archivos de entorno propios de `tests/e2e/env`, no por el entorno del desarrollador.

---

## 11. Checklist de deploy

**Problema que resuelve.** Que la migración y el cliente salgan **juntos** y en el orden correcto.

**Cómo se implementa acá.** Piezas: `supabase/migrations/20261116000000_schema.sql`, `npm run db:status`, `npm run db:dry`, `npm run db:push`, `vercel.json`, `src/lib/appMode.ts`. Checklist, en orden:

1. `npm run db:status` y `npm run db:dry` contra el proyecto linkeado.
2. `npm run db:push` **antes** de desplegar el cliente que llama a las RPC nuevas.
3. Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel para Production **y** Preview.
4. Configurar las Redirect URLs `https://<dominio>/**` en Supabase.
5. `npm test` y `npm run build` en limpio.
6. Verificar con **DOS cuentas temporales**: crear hogar, invitar, unirse, cargar un gasto desde cada una.
7. Confirmar que los datos compartidos siguen intactos al borrar una de las dos cuentas.
8. Revisar la consola del navegador: sin 403 de RLS, sin `could not find function`, sin errores de `sw.js`.

**Lección aprendida.** Si sale primero el front que llama a `my_household` y la RPC no existe, todos los usuarios ven `could not find function my_household`. Y **una sola cuenta no prueba RLS**: los 403 por membresía aparecen recién con la segunda.

---

## 12. Tabla de troubleshooting

**Problema que resuelve.** No re-derivar la causa de los síntomas clásicos cada vez que alguien retoma el proyecto.

**Cómo se implementa acá.** Cada fila apunta al archivo que hay que mirar: `src/lib/appMode.ts`, `src/App.tsx`, `src/types.ts`, `src/lib/adapters/cloud.ts`, `src/lib/adapters/offline.ts`, `src/lib/household.ts`, `src/lib/invite.ts`, `src/lib/recovery.ts`, `src/lib/realtime.ts`, `src/state/AppContext.tsx`, `supabase/migrations/20261116000000_schema.sql`, `vercel.json`.

| Síntoma | Causa probable | Dónde mirar / qué hacer |
| --- | --- | --- |
| "Falta configurar Supabase" (`ConfigMissing`) | Faltan `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, o se cargaron después del build | `.env.example` → `.env.local`; `src/lib/appMode.ts` (`unconfigured`); en Vercel recargar env y rebuild |
| `could not find function my_household` | No se aplicó la migración, o el cliente salió antes que ella | `supabase/migrations/20261116000000_schema.sql`, `npm run db:status`, `npm run db:push` |
| `null value in column ...` | Falta un campo obligatorio en el insert (típicamente `amount_cents` o `household_id`) | `src/types.ts` (`Expense`), `src/lib/adapters/cloud.ts`; acordate del mapeo `amountCents` → `amount_cents` |
| Insert con `household_id` ajeno devuelve 403 | RLS funcionando: el `user_id` no es miembro de ese hogar | Policies e `is_household_member(uuid)` en la migración; `src/lib/household.ts` (`my_household` / `ensure_household`) |
| Cola offline que no sincroniza | El error no era de red y por eso no se encoló, no se llamó `flush()`, o la cola quedó en otro `householdId` | `isOfflineError`, `gastos:queue:v1:<householdId>`, `flush` / `rescope` en `src/lib/adapters/offline.ts` |
| Link de invitación que no abre | Token perdido antes del login, o abierto como path en vez de hash | `#/unirse/<token>`, `captureInvite()` en `src/main.tsx` + `src/lib/invite.ts`, `sessionStorage`, Gate de `src/App.tsx` |
| Recovery que no muestra `ResetPasswordScreen` | Redirect URL no configurada, o el Gate no detecta el tipo `recovery` | `https://<dominio>/**` en Supabase, `src/lib/recovery.ts`, Gate de `src/App.tsx` |
| PWA que no instala | No es HTTPS, o faltan manifest/íconos | `vite-plugin-pwa`, `vercel.json`; probar en localhost o HTTPS |
| `db:push` con migraciones pendientes en base ya migrada | La base ya tiene el schema a mano pero el historial de migraciones está vacío | Marcar baseline con el subcomando `migration repair --status applied` de la CLI; antes `npm run db:dry` |
| Realtime que no refresca | No se unió al canal `gastos:hh:<householdId>`, la señal llegó antes de la suscripción, o `shouldRefreshFromRealtime()` bloqueó la relectura por cola pendiente | `src/lib/realtime.ts`, `src/state/AppContext.tsx` (debounce 350 ms) |
| Caché vieja del service worker | `sw.js` servido con caché fuerte, o el `autoUpdate` nunca llegó | `Cache-Control: public, max-age=0, must-revalidate` en `vercel.json`, `registerType: 'autoUpdate'` |
| Gastos de otro hogar que "aparecen" al cambiar de hogar | No se hizo `rescope` de caché y cola | `gastos:cache:v1:<householdId>:expenses`, `gastos:queue:v1:<householdId>`, `rescope` |
| Montos con decimales raros (`10.00000000001`) | Se usó float en vez de centavos | `amount_cents integer`, `src/lib/money.ts`, `src/types.ts` |

**Lección aprendida.** La mayoría de estos síntomas son de *configuración u orden*, no de lógica: antes de tocar código, fijate `npm run db:status`, el modo en `src/lib/appMode.ts` y si hubo rebuild después de cambiar las variables.

---

## Lecciones que NO repetir

- **No usar float para dinero.** `amount_cents integer` en centavos, siempre; `src/lib/money.ts` existe para eso.
- **No confiar en `auth.uid()` directo en policies autorreferentes.** Recursa: va con el helper `is_household_member(uuid)` `security definer`.
- **No dejar modo local en producción.** El local es exclusivo de `--mode e2e`; para usuarios reales, sin credenciales hay `ConfigMissing` y nada más.
- **No aplicar la migración sin el cliente compatible** (ni el cliente sin la migración). Salen juntos y en ese orden.
- **No hardcodear rubros.** Las categorías no son una lista cerrada metida en `src/lib/constants.ts`; las custom por hogar son una idea a futuro, no un `enum` eterno.
- **No olvidar el baseline.** `migration repair --status applied` antes de `npm run db:push` sobre una base ya migrada a mano.
