# Migraciones de Supabase · OrganizadorGastos

Acá vive el esquema de la base de la PWA de gastos compartidos por hogar.
Es un **proyecto nuevo**, así que arrancamos de cero: no hay nada que "alinear"
con una base que ya existiera.

## Cómo se versiona

Cada `.sql` de esta carpeta se nombra con un timestamp
(`YYYYMMDDHHMMSS_nombre.sql`) y el CLI los aplica **en orden**. El registro de
cuáles ya se aplicaron lo lleva la propia base remota, en la tabla
`supabase_migrations.schema_migrations` (esquema `supabase_migrations`). O sea:
el control de "ya la corrí" no está en este repo, está en el servidor.

Por eso mismo **no edites una migración ya aplicada**: si le cambiás el
contenido, el CLI no la va a volver a correr y tu local va a quedar distinto del
remoto. El SQL está escrito para ser idempotente (`IF NOT EXISTS`,
`CREATE OR REPLACE`, `DROP POLICY IF EXISTS`) igual, pero eso es una red de
seguridad para reseteos locales, no una licencia para pisar historia.

## Migraciones

| Migración | Qué crea |
| --- | --- |
| `20261120000000_notifications.sql` | Crea `notifications` con RLS por usuario y un trigger en `expenses` que avisa a los demás miembros del hogar cuando se carga un gasto. Agrupa las inserciones en ventanas de 5 minutos para evitar avalanchas. |
| `20261116000500_display_names.sql` | Agrega `household_members.display_name` (nombre visible), lo completa para los usuarios existentes desde el email, actualiza `ensure_household`, `household_join` y `household_members_list`, y crea el RPC `household_set_display_name`. |
| `20261116000400_transfers_trips_recurrence.sql` | Crea `transfers` (pagos entre miembros que descuentan del saldo) y `trips` (bolsillos con moneda base propia); agrega a `expenses` los campos `trip_id`, `recurrence` y `recurrence_group_id`; RLS por membresía en las tablas nuevas. |
| `20261116000300_fix_new_household.sql` | Corrige el error "No pertenecés a ningún hogar" en cuentas nuevas: `household_invite_create`, `household_invite_list`, `household_rename` y `household_set_base_currency` pasan a llamar a `ensure_household()` en vez de exigir una membresía ya existente. |
| `20261116000200_currency.sql` | Agrega `households.base_currency` (EUR por defecto) y, en `expenses`, `currency` y `base_amount_cents` (equivalente en la moneda base, usado por todas las métricas). Recrea `my_household` para devolver la moneda base y agrega el RPC `household_set_base_currency`. Los gastos existentes quedan en EUR con equivalente igual al monto original. |
| `20261116000100_expense_payer_shares.sql` | Agrega a `expenses` las columnas `paid_by` (quién pagó) y `shares` (reparto en puntos básicos, suma 10000), con la función `shares_are_valid()` como check. Completa los gastos existentes: pagador = `created_by` o dueño del hogar, reparto 50/50. |
| `20261116000000_schema.sql` | La extensión `pgcrypto`; las tablas `households`, `household_members`, `household_invites` y `expenses` con sus índices (incluido el único de `user_id`); RLS en las 4 tablas; el helper anti-recursión `is_household_member()`; las policies (escritura directa **sólo** en `expenses`); las 11 RPC (`ensure_household`, `my_household`, `household_members_list`, `household_invite_create`, `household_invite_list`, `household_invite_revoke`, `household_invite_info`, `household_join`, `household_leave`, `household_rename`, `delete_my_account`); y un bloque `DO` final que cuenta hogares/memberships/gastos y verifica que no haya gastos con `household_id IS NULL`. |

Las tablas `households`, `household_members` y `household_invites` **no tienen
policies de escritura**: todo cambio pasa por las RPC `SECURITY DEFINER`, que
validan membresía antes de tocar nada.

## Comandos

Según los scripts del `package.json` del proyecto:

```bash
npx supabase login                        # autenticarse con la CLI (una vez)
npx supabase link --project-ref <ref>     # vincular al proyecto remoto
npm run db:status                         # migration list --linked: estado en el remoto
npm run db:dry                            # db push --dry-run: qué se aplicaría, sin aplicar
npm run db:push                           # db push: aplica las pendientes al remoto
npm run db:migrations                     # script propio: lista/valida las migraciones locales
```

Ojo que `db:status`, `db:dry` y `db:push` apuntan al **remoto**; el script
`db:migrations` es local y, además de validar nombres y orden, te escupe los
comandos recomendados (incluido el de baseline de más abajo).

El `<ref>` lo sacás del dashboard de Supabase. **No lo commitees** ni lo pongas
en el `config.toml`: `link` lo guarda de forma local en archivos que no se
versionan. Y ni hablar de keys, service_role o contraseñas: acá no va ninguna
credencial; las variables de entorno las maneja cada entorno.

Fijate en el orden: primero `login`, después `link`, y recién ahí tiene sentido
`db:status` / `db:push` contra el remoto.

## Baseline: acá no hace falta

Como es un proyecto nuevo, la base remota está vacía y el CLI aplica la
migración inicial de una: **no hay que hacer baseline**.

Si en cambio estuvieras adoptando el CLI sobre un proyecto **ya migrado a mano**
(esquema creado a fuerza de `psql` o desde el SQL editor, sin registro en
`schema_migrations`), el CLI intentaría correr de nuevo la inicial y se te
rompería. Para ese caso se "marca" la versión como ya aplicada en el remoto:

```bash
npx supabase migration repair 20261116000000 --status applied --linked
```

(`--status` también acepta `reverted`, para deshacer el marcado si te
equivocaste.) Es exclusivamente para ese escenario de adopción; en este repo no
lo necesitás.

## Cómo agregar una migración nueva

```bash
npx supabase migration new nombre_descriptivo
npm run db:push
```

El primero te crea el archivo con el timestamp correcto; lo editás y el segundo
lo aplica. Acordate: **no edites una ya aplicada** — si te equivocaste, agregá
una migración nueva que corrija, no reescribas la vieja.

## Decisiones de diseño

- **`amount_cents integer` en vez de `float` / `numeric`.** Con plata, el float
  te juega en contra: `0.1 + 0.2 != 0.3` y los errores de redondeo se acumulan
  al sumar gastos. Guardar centavos como entero hace que las sumas sean exactas
  y que el `check (amount_cents >= 0)` sea trivial. `numeric` también sería
  exacto, pero para montos de consumo un `integer` es más simple, más barato y
  evita arrastrar precisión/escala a todos lados. El formato a pesos lo hace la
  UI dividiendo por 100.

- **RLS por membresía con helper `SECURITY DEFINER`.** Todas las policies
  preguntan `is_household_member(...)`. Si esa función fuera
  `SECURITY INVOKER`, al leer `household_members` para responder se dispararía
  la policy de `household_members`, que vuelve a llamar al helper → recursión
  infinita. Siendo `SECURITY DEFINER` (y con `search_path` fijo) la consulta
  interna saltea RLS y corta el loop. Además tiene `REVOKE` de `PUBLIC`/`anon` y
  `GRANT` explícito, igual que cada RPC.

- **`user_id` / `created_by` sin FK a `auth.users`.** Sólo
  `household_members.user_id` tiene FK (con `ON DELETE CASCADE`), que es la
  fila de pertenencia y sí debe irse con la cuenta. Los `created_by` de
  `households`, `expenses` e `invites` son metadata pura: si les colgáramos una
  FK, borrar una cuenta (`delete_my_account()`) se llevaría puestos los gastos
  compartidos de todo el hogar. Así, al borrar una cuenta los gastos de los
  demás quedan intactos; cuando el hogar queda huérfano recién ahí el
  `ON DELETE CASCADE` limpia sus gastos e invitaciones.
