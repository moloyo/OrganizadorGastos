-- =============================================================================
-- OrganizadorGastos · nombres visibles · 20261116000500
-- El nombre se guarda en household_members (lo ven todos los del hogar) y se
-- toma del metadata de auth.users al crear la membresía. Los usuarios ya
-- existentes reciben un nombre derivado de su email.
-- =============================================================================

alter table public.household_members add column if not exists display_name text;

update public.household_members hm
   set display_name = coalesce(nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email, '@', 1))
  from auth.users u
 where u.id = hm.user_id
   and (hm.display_name is null or btrim(hm.display_name) = '');

-- ensure_householder y household_join crean membresías: completan el nombre.
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

    insert into public.household_members (household_id, user_id, role, display_name)
    values (
      v_household_id, v_uid, 'owner',
      coalesce(
        nullif(btrim((select raw_user_meta_data ->> 'display_name' from auth.users where id = v_uid)), ''),
        split_part((select email from auth.users where id = v_uid), '@', 1),
        'Yo'
      )
    );
  end if;

  return query
    select h.id, h.name
    from public.households h
    where h.id = v_household_id;
end;
$$;

revoke all on function public.ensure_household() from public, anon;
grant execute on function public.ensure_household() to authenticated;

-- household_join cambia el RETURNS TABLE? No, sólo el INSERT interno.
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

  select i.household_id into v_dest
  from public.household_invites i
  where i.token = p_token
    and i.revoked_at is null
    and i.expires_at > now();
  if v_dest is null then
    raise exception 'Invitación inválida o vencida';
  end if;

  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = v_dest and hm.user_id = v_uid
  ) then
    select e.id into v_origin from public.ensure_household() e;

    update public.expenses ex
       set household_id = v_dest
     where ex.household_id = v_origin;

    delete from public.household_members hm
     where hm.household_id = v_origin and hm.user_id = v_uid;

    if not exists (
      select 1 from public.household_members hm where hm.household_id = v_origin
    ) then
      delete from public.households h where h.id = v_origin;
    end if;

    insert into public.household_members (household_id, user_id, role, display_name)
    values (
      v_dest, v_uid, 'member',
      coalesce(
        nullif(btrim((select raw_user_meta_data ->> 'display_name' from auth.users where id = v_uid)), ''),
        split_part((select email from auth.users where id = v_uid), '@', 1),
        'Yo'
      )
    )
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

-- El listado cambia su RETURNS TABLE: se recrea.
drop function if exists public.household_members_list();

create or replace function public.household_members_list()
returns table(user_id uuid, email text, display_name text, role text, joined_at timestamptz)
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
    select hm.user_id,
           u.email::text,
           coalesce(nullif(btrim(hm.display_name), ''), split_part(u.email, '@', 1)) as display_name,
           hm.role,
           hm.joined_at
    from public.household_members hm
    join auth.users u on u.id = hm.user_id
    where hm.household_id = v_household_id
    order by hm.joined_at;
end;
$$;

revoke all on function public.household_members_list() from public, anon;
grant execute on function public.household_members_list() to authenticated;

create or replace function public.household_set_display_name(p_name text)
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
  if char_length(v_name) > 40 then
    raise exception 'El nombre no puede superar los 40 caracteres';
  end if;

  update public.household_members hm
     set display_name = v_name
   where hm.household_id = v_household_id and hm.user_id = v_uid;
end;
$$;

revoke all on function public.household_set_display_name(text) from public, anon;
grant execute on function public.household_set_display_name(text) to authenticated;
