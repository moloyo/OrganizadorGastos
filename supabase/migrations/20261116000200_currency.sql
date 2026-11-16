-- =============================================================================
-- OrganizadorGastos · moneda por gasto y moneda base del hogar · 20261116000200
--   households.base_currency  : moneda en que se muestran los totales (EUR por defecto)
--   expenses.currency         : moneda en que se pagó
--   expenses.base_amount_cents: equivalente en la moneda base; lo usan TODAS las métricas
-- Los gastos existentes se marcan con EUR y su equivalente es el monto original,
-- para que ningún total cambie de valor al aplicar la migración.
-- =============================================================================

alter table public.households add column if not exists base_currency text not null default 'EUR';
alter table public.households drop constraint if exists households_base_currency_check;
alter table public.households add constraint households_base_currency_check
  check (base_currency in ('EUR', 'ARS', 'USD'));

alter table public.expenses add column if not exists currency text not null default 'EUR';
alter table public.expenses add column if not exists base_amount_cents integer not null default 0;
alter table public.expenses drop constraint if exists expenses_currency_check;
alter table public.expenses add constraint expenses_currency_check
  check (currency in ('EUR', 'ARS', 'USD'));

update public.expenses
   set base_amount_cents = amount_cents
 where base_amount_cents = 0;

-- my_household cambia su RETURNS TABLE (se agrega base_currency): Postgres no
-- permite CREATE OR REPLACE con otro tipo de retorno, así que se recrea.
drop function if exists public.my_household();

create or replace function public.my_household()
returns table(id uuid, name text, role text, member_count bigint, base_currency text)
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
           (select count(*) from public.household_members m where m.household_id = h.id),
           h.base_currency
    from public.households h
    join public.household_members hm
      on hm.household_id = h.id and hm.user_id = auth.uid()
    where h.id = v_household_id;
end;
$$;

revoke all on function public.my_household() from public, anon;
grant execute on function public.my_household() to authenticated;

-- Cambia la moneda base del hogar. No convierte gastos viejos: cada gasto
-- guarda su propio equivalente en centavos de la moneda elegida al cargarlo.
create or replace function public.household_set_base_currency(p_currency text)
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
  if p_currency not in ('EUR', 'ARS', 'USD') then
    raise exception 'Moneda no soportada';
  end if;

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_uid;
  if v_household_id is null then
    raise exception 'No pertenecés a ningún hogar';
  end if;

  update public.households h
     set base_currency = p_currency
   where h.id = v_household_id;
end;
$$;

revoke all on function public.household_set_base_currency(text) from public, anon;
grant execute on function public.household_set_base_currency(text) to authenticated;

do $$
declare
  v_gastos bigint;
begin
  select count(*) into v_gastos from public.expenses;
  raise notice 'Monedas OK · gastos con equivalente: %', v_gastos;
end;
$$;
