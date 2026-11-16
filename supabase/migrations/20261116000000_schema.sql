-- =============================================================================
-- OrganizadorGastos · esquema inicial · 20261116000000_schema.sql
-- PWA de gastos compartidos por hogar.
-- =============================================================================
-- Orden de ejecución (pensado para que el archivo sea IDEMPOTENTE, o sea que
-- se pueda correr dos veces sin errores):
--   1. Extensión pgcrypto (gen_random_uuid).
--   2. Tablas con CREATE TABLE IF NOT EXISTS.
--   3. Índices con CREATE [UNIQUE] INDEX IF NOT EXISTS.
--   4. RLS habilitado en las 4 tablas.
--   5. Helper anti-recursión is_household_member() (SECURITY DEFINER).
--   6. Policies: siempre DROP POLICY IF EXISTS antes de CREATE POLICY.
--   7. RPCs con CREATE OR REPLACE FUNCTION + REVOKE/GRANT explícitos.
--      Toda escritura a households / household_members / household_invites
--      pasa por acá, ya que esas tablas no tienen policies de escritura.
--   8. Bloque DO final con conteos y verificación de integridad.
--
-- El CLI de Supabase registra las migraciones ya aplicadas en
-- supabase_migrations.schema_migrations: en condiciones normales este archivo
-- corre una sola vez por base. Igualmente está escrito para tolerar una segunda
-- ejecución (útil en entornos locales que se resetean a mano).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi hogar',
  created_by uuid,                       -- sin FK a auth.users: sobrevive al borrar la cuenta
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_invites (
  token uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  used_count integer not null default 0
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),  -- centavos, nunca float
  category text not null default 'Otros',
  spent_on date not null default current_date,
  note text not null default '',
  created_by uuid,                        -- metadata, sin FK
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Índices
-- -----------------------------------------------------------------------------

-- La PK de household_members es (household_id, user_id): sirve para buscar por
-- hogar, pero no por usuario. El índice ÚNICO por user_id cubre esa búsqueda y
-- además refuerza la regla de negocio "un usuario = un hogar" (no hace falta
-- un índice simple adicional).
create unique index if not exists household_members_user_id_unique
  on public.household_members (user_id);

create index if not exists expenses_household_spent_on_idx
  on public.expenses (household_id, spent_on desc);
create index if not exists expenses_household_category_idx
  on public.expenses (household_id, category);
create index if not exists household_invites_household_created_at_idx
  on public.household_invites (household_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.expenses enable row level security;

-- -----------------------------------------------------------------------------
-- 5. Helper anti-recursión
--    Es SECURITY DEFINER: consulta household_members SIN disparar las policies
--    de esa misma tabla. Si fuera SECURITY INVOKER, la policy de SELECT sobre
--    household_members volvería a llamar al helper -> recursión infinita.
-- -----------------------------------------------------------------------------

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
  )
$$;

revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Policies
--    Sólo gastos se escribe directo por el cliente. households,
--    household_members y household_invites NO tienen policies de
--    INSERT/UPDATE/DELETE: se modifican exclusivamente vía RPC SECURITY DEFINER.
-- -----------------------------------------------------------------------------

drop policy if exists expenses_member_all on public.expenses;
create policy expenses_member_all on public.expenses
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists households_member_select on public.households;
create policy households_member_select on public.households
  for select
  using (public.is_household_member(id));

drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select
  using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists household_invites_member_select on public.household_invites;
create policy household_invites_member_select on public.household_invites
  for select
  using (public.is_household_member(household_id));

-- -----------------------------------------------------------------------------
-- 7. RPCs
--    Todas SECURITY DEFINER + search_path fijo. Para cada una se revoca de
--    PUBLIC/anon y se concede sólo a authenticated. Los nombres de variables
--    van con prefijo v_ y se usa #variable_conflict use_column para que las
--    columnas de RETURNS TABLE no choquen con las columnas de las tablas.
-- -----------------------------------------------------------------------------

-- 7.1 Devuelve (y si hace falta, crea) el hogar del usuario autenticado.
--     El advisory lock por usuario evita dos hogares por carrera concurrente.
create or replace function public.ensure_household()
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_household_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('gastos_ensure_' || v_uid::text)::bigint);

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_uid
  limit 1;

  if v_household_id is null then
    insert into public.households as h (created_by)
    values (v_uid)
    returning h.id into v_household_id;

    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, v_uid, 'owner');
  end if;

  return query
    select h.id, h.name
    from public.households h
    where h.id = v_household_id;
end;
$$;

revoke all on function public.ensure_household() from public, anon;
grant execute on function public.ensure_household() to authenticated;

-- 7.2 Datos del hogar actual + cantidad de miembros.
create or replace function public.my_household()
returns table(id uuid, name text, role text, member_count bigint)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_household_id uuid;
begin
  select e.id into v_household_id from public.ensure_household() e;

  return query
    select h.id,
           h.name,
           hm.role,
           (select count(*) from public.household_members m where m.household_id = h.id)
    from public.households h
    join public.household_members hm
      on hm.household_id = h.id and hm.user_id = auth.uid()
    where h.id = v_household_id;
end;
$$;

revoke all on function public.my_household() from public, anon;
grant execute on function public.my_household() to authenticated;

-- 7.3 Listado de miembros con su email (join contra auth.users).
create or replace function public.household_members_list()
returns table(user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_household_id uuid;
begin
  select e.id into v_household_id from public.ensure_household() e;

  return query
    select hm.user_id, u.email::text, hm.role, hm.joined_at
    from public.household_members hm
    join auth.users u on u.id = hm.user_id
    where hm.household_id = v_household_id
    order by hm.joined_at;
end;
$$;

revoke all on function public.household_members_list() from public, anon;
grant execute on function public.household_members_list() to authenticated;

-- 7.4 Crea una invitación y devuelve su token.
create or replace function public.household_invite_create()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_uid;
  if v_household_id is null then
    raise exception 'No pertenecés a ningún hogar';
  end if;

  insert into public.household_invites as i (household_id, created_by)
  values (v_household_id, v_uid)
  returning i.token into v_token;

  return v_token;
end;
$$;

revoke all on function public.household_invite_create() from public, anon;
grant execute on function public.household_invite_create() to authenticated;

-- 7.5 Invitaciones del hogar del usuario. Se filtra por membresía porque al
--     ser SECURITY DEFINER no aplica la RLS de household_invites.
create or replace function public.household_invite_list()
returns table(token uuid, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, used_count integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_uid;
  if v_household_id is null then
    raise exception 'No pertenecés a ningún hogar';
  end if;

  return query
    select i.token, i.created_at, i.expires_at, i.revoked_at, i.used_count
    from public.household_invites i
    where i.household_id = v_household_id
    order by i.created_at desc;
end;
$$;

revoke all on function public.household_invite_list() from public, anon;
grant execute on function public.household_invite_list() to authenticated;

-- 7.6 Revoca una invitación, verificando membresía SOBRE el hogar de la invitación.
create or replace function public.household_invite_revoke(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  select i.household_id into v_household_id
  from public.household_invites i
  where i.token = p_token;
  if v_household_id is null then
    raise exception 'Invitación inexistente';
  end if;

  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = v_household_id and hm.user_id = v_uid
  ) then
    raise exception 'No tenés permiso para revocar esta invitación';
  end if;

  update public.household_invites i
     set revoked_at = now()
   where i.token = p_token;
end;
$$;

revoke all on function public.household_invite_revoke(uuid) from public, anon;
grant execute on function public.household_invite_revoke(uuid) to authenticated;

-- 7.7 Info pública de la invitación para el invitado. No requiere membresía
--     (SECURITY DEFINER saltea la RLS); si el token no es válido devuelve 0 filas.
--     Es SQL puro: no necesita lógica plpgsql.
create or replace function public.household_invite_info(p_token uuid)
returns table(household_id uuid, household_name text, member_count bigint, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.household_id,
         h.name,
         (select count(*) from public.household_members m where m.household_id = i.household_id),
         i.expires_at
  from public.household_invites i
  join public.households h on h.id = i.household_id
  where i.token = p_token
    and i.revoked_at is null
    and i.expires_at > now()
$$;

revoke all on function public.household_invite_info(uuid) from public, anon;
grant execute on function public.household_invite_info(uuid) to authenticated;

-- 7.8 Une al usuario al hogar destino. Mueve TODOS los gastos del hogar origen
--     al destino antes de borrar la membresía de origen (el índice único de
--     user_id obliga a sacar la vieja fila antes de insertar la nueva).
create or replace function public.household_join(p_token uuid)
returns table(household_id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_dest uuid;
  v_origin uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  -- Validación del token: existe, no revocado y no vencido.
  select i.household_id into v_dest
  from public.household_invites i
  where i.token = p_token
    and i.revoked_at is null
    and i.expires_at > now();
  if v_dest is null then
    raise exception 'Invitación inválida o vencida';
  end if;

  -- Si ya es miembro del destino, devuelve sin mover nada.
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = v_dest and hm.user_id = v_uid
  ) then
    -- Hogar de origen (ensure_household lo crea si el usuario no tenía ninguno).
    select e.id into v_origin from public.ensure_household() e;

    -- Movemos TODOS los gastos del origen al destino.
    update public.expenses ex
       set household_id = v_dest
     where ex.household_id = v_origin;

    -- Salimos del origen ANTES de entrar al destino: un usuario = un hogar.
    delete from public.household_members hm
     where hm.household_id = v_origin and hm.user_id = v_uid;

    -- Si el origen quedó sin miembros, se borra (cascade limpia lo que quedó).
    if not exists (
      select 1 from public.household_members hm where hm.household_id = v_origin
    ) then
      delete from public.households h where h.id = v_origin;
    end if;

    insert into public.household_members (household_id, user_id, role)
    values (v_dest, v_uid, 'member')
    on conflict do nothing;

    update public.household_invites i
       set used_count = i.used_count + 1
     where i.token = p_token;
  end if;

  return query
    select h.id, h.name
    from public.households h
    where h.id = v_dest;
end;
$$;

revoke all on function public.household_join(uuid) from public, anon;
grant execute on function public.household_join(uuid) to authenticated;

-- 7.9 Salir del hogar actual.
--     OJO CON LOS DATOS COMPARTIDOS: si quedan otros miembros, el hogar NO se
--     borra y los gastos compartidos se quedan ahí; quien se va no se lleva
--     nada ni los borra. Sólo cuando el hogar queda huérfano el ON DELETE
--     CASCADE limpia sus gastos e invitaciones. Después ensure_household()
--     deja al usuario con un hogar nuevo y vacío.
create or replace function public.household_leave()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_uid;

  if v_household_id is not null then
    delete from public.household_members hm
     where hm.household_id = v_household_id and hm.user_id = v_uid;

    if not exists (
      select 1 from public.household_members hm where hm.household_id = v_household_id
    ) then
      delete from public.households h where h.id = v_household_id;
    end if;
  end if;

  -- Hogar nuevo y vacío para el usuario que se fue.
  perform 1 from public.ensure_household();
end;
$$;

revoke all on function public.household_leave() from public, anon;
grant execute on function public.household_leave() to authenticated;

-- 7.10 Renombrar el hogar: trim, no vacío, máximo 60 caracteres.
create or replace function public.household_rename(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_uid;
  if v_household_id is null then
    raise exception 'No pertenecés a ningún hogar';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'El nombre no puede estar vacío';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'El nombre no puede superar los 60 caracteres';
  end if;

  update public.households h
     set name = v_name
   where h.id = v_household_id;
end;
$$;

revoke all on function public.household_rename(text) from public, anon;
grant execute on function public.household_rename(text) to authenticated;

-- 7.11 Borrado de cuenta. Guardamos los hogares del usuario en un array,
--      limpiamos sus memberships, borramos SOLO los hogares que quedaron sin
--      miembros (cascade limpia gastos e invitaciones) y recién al final
--      borramos la fila de auth.users. Al no haber FKs desde gastos/hogares
--      hacia auth.users, los datos compartidos de otros miembros sobreviven.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_ids uuid[];
begin
  if v_uid is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  select array_agg(hm.household_id) into v_household_ids
  from public.household_members hm
  where hm.user_id = v_uid;
  v_household_ids := coalesce(v_household_ids, array[]::uuid[]);

  delete from public.household_members hm where hm.user_id = v_uid;

  delete from public.households h
   where h.id = any(v_household_ids)
     and not exists (
       select 1 from public.household_members hm where hm.household_id = h.id
     );

  -- Recién después de limpiar todo lo nuestro, borramos la cuenta.
  delete from auth.users u where u.id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Verificación final
-- -----------------------------------------------------------------------------

do $$
declare
  v_hogares bigint;
  v_memberships bigint;
  v_gastos bigint;
  v_gastos_huerfanos bigint;
begin
  select count(*) into v_hogares from public.households;
  select count(*) into v_memberships from public.household_members;
  select count(*) into v_gastos from public.expenses;
  select count(*) into v_gastos_huerfanos
    from public.expenses e
   where e.household_id is null;

  if v_gastos_huerfanos > 0 then
    raise exception 'Verificación fallida: hay % gasto(s) con household_id NULL', v_gastos_huerfanos;
  end if;

  raise notice 'Esquema OK · hogares: % · memberships: % · gastos: % · gastos sin hogar: %',
    v_hogares, v_memberships, v_gastos, v_gastos_huerfanos;
end;
$$;
