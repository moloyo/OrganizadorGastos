-- =============================================================================
-- OrganizadorGastos · pagador y reparto por gasto · 20261116000100
--   paid_by: userId de quien pagó (por defecto, quien cargó el gasto).
--   shares:  { "<userId>": puntos básicos }, suma 10000 (10000 = 100 %).
-- Los gastos existentes se completan con: pagador = created_by (o el dueño
-- del hogar si no hay dato) y reparto 50/50 entre los miembros actuales.
-- =============================================================================

alter table public.expenses add column if not exists paid_by uuid;
alter table public.expenses add column if not exists shares jsonb;

update public.expenses e
   set paid_by = coalesce(
     e.created_by,
     (select hm.user_id
        from public.household_members hm
       where hm.household_id = e.household_id
       order by (hm.role = 'owner') desc, hm.joined_at
       limit 1)
   )
 where e.paid_by is null;

with counts as (
  select household_id, count(*)::int as n
    from public.household_members
   group by household_id
),
parts as (
  select hm.household_id,
         hm.user_id,
         (10000 / c.n) + case
           when row_number() over (partition by hm.household_id order by hm.joined_at, hm.user_id)
                <= (10000 % c.n) then 1 else 0
         end as bps
    from public.household_members hm
    join counts c on c.household_id = hm.household_id
)
update public.expenses e
   set shares = s.shares
  from (
    select household_id, jsonb_object_agg(user_id::text, bps) as shares
      from parts
     group by household_id
  ) s
 where s.household_id = e.household_id
   and e.shares is null;

alter table public.expenses alter column paid_by set not null;
alter table public.expenses alter column shares set not null;

create or replace function public.shares_are_valid(p_shares jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_shares) = 'object'
    and p_shares <> '{}'::jsonb
    and (
      select coalesce(sum(value::int), 0) = 10000 and bool_and(value::int >= 0)
        from jsonb_each_text(p_shares)
    )
$$;

alter table public.expenses drop constraint if exists expenses_shares_total_check;
alter table public.expenses add constraint expenses_shares_total_check
  check (public.shares_are_valid(shares));

do $$
declare
  v_gastos bigint;
  v_sin_pagador bigint;
begin
  select count(*) into v_gastos from public.expenses;
  select count(*) into v_sin_pagador from public.expenses where paid_by is null;
  raise notice 'Pagador y reparto OK · gastos: % · sin pagador: %', v_gastos, v_sin_pagador;
end;
$$;
