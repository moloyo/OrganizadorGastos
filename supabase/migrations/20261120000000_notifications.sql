-- =============================================================================
-- OrganizadorGastos · notificaciones de gastos · 20261120000000
-- Un trigger crea una notificación por cada miembro del hogar distinto de
-- quien cargó el gasto. Se agrupan en ventanas de 5 minutos para no llenar
-- el centro de notificaciones cuando se importan o se reparten gastos.
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null,
  kind text not null default 'expense',
  actor_id uuid,
  expense_id uuid,
  description text not null default '',
  amount_cents integer not null default 0,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select
  using (user_id = auth.uid() and public.is_household_member(household_id));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update
  using (user_id = auth.uid() and public.is_household_member(household_id))
  with check (user_id = auth.uid() and public.is_household_member(household_id));

-- Los gastos nuevos deben saber quién los cargó para no avisarle a esa persona.
alter table public.expenses alter column created_by set default auth.uid();

create or replace function public.notify_expense_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Varios gastos juntos (importación, recurrencia) generan una sola tanda.
  if exists (
    select 1 from public.notifications n
    where n.household_id = NEW.household_id
      and n.kind = 'expense'
      and n.created_at > now() - interval '5 minutes'
  ) then
    return null;
  end if;

  insert into public.notifications (
    household_id, user_id, kind, actor_id, expense_id, description, amount_cents
  )
  select NEW.household_id,
         hm.user_id,
         'expense',
         NEW.created_by,
         NEW.id,
         NEW.description,
         NEW.base_amount_cents
    from public.household_members hm
   where hm.household_id = NEW.household_id
     and hm.user_id is distinct from NEW.created_by;

  return null;
end;
$$;

drop trigger if exists expenses_notify_member on public.expenses;
create trigger expenses_notify_member
  after insert on public.expenses
  for each row execute function public.notify_expense_created();

do $$
begin
  raise notice 'Notificaciones de gastos listas';
end;
$$;
