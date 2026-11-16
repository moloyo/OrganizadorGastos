-- =============================================================================
-- OrganizadorGastos · hogar para cuentas nuevas · 20261116000300
-- Varias RPC buscaban la membresía del usuario y tiraban error si no existía.
-- Al cargar la app se llaman en paralelo, así que una cuenta nueva podía
-- recibir "No pertenecés a ningún hogar" antes de que my_household creara el
-- hogar. Todas pasan a usar ensure_household(), que lo crea si falta.
-- =============================================================================

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

  select e.id into v_household_id from public.ensure_household() e;

  insert into public.household_invites as i (household_id, created_by)
  values (v_household_id, v_uid)
  returning i.token into v_token;

  return v_token;
end;
$$;

revoke all on function public.household_invite_create() from public, anon;
grant execute on function public.household_invite_create() to authenticated;

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

  select e.id into v_household_id from public.ensure_household() e;

  return query
    select i.token, i.created_at, i.expires_at, i.revoked_at, i.used_count
    from public.household_invites i
    where i.household_id = v_household_id
    order by i.created_at desc;
end;
$$;

revoke all on function public.household_invite_list() from public, anon;
grant execute on function public.household_invite_list() to authenticated;

create or replace function public.household_rename(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;

  select e.id into v_household_id from public.ensure_household() e;

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

create or replace function public.household_set_base_currency(p_currency text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Se requiere autenticación' using errcode = '42501';
  end if;
  if p_currency not in ('EUR', 'ARS', 'USD') then
    raise exception 'Moneda no soportada';
  end if;

  select e.id into v_household_id from public.ensure_household() e;

  update public.households h
     set base_currency = p_currency
   where h.id = v_household_id;
end;
$$;

revoke all on function public.household_set_base_currency(text) from public, anon;
grant execute on function public.household_set_base_currency(text) to authenticated;

do $$
begin
  raise notice 'RPC de hogar actualizadas para cuentas nuevas';
end;
$$;
