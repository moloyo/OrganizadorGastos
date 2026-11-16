-- =============================================================================
-- OrganizadorGastos · transferencias, viajes y gastos recurrentes · 20261116000400
-- =============================================================================

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  base_currency text not null default 'EUR'
    check (base_currency in ('EUR', 'ARS', 'USD')),
  starts_on date not null default current_date,
  ends_on date not null default current_date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  trip_id uuid,
  from_user_id uuid not null,
  to_user_id uuid not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'ARS', 'USD')),
  base_amount_cents integer not null default 0,
  note text not null default '',
  paid_on date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.transfers drop constraint if exists transfers_trip_fk;
alter table public.transfers add constraint transfers_trip_fk
  foreign key (trip_id) references public.trips(id) on delete set null;

alter table public.expenses add column if not exists trip_id uuid;
alter table public.expenses drop constraint if exists expenses_trip_fk;
alter table public.expenses add constraint expenses_trip_fk
  foreign key (trip_id) references public.trips(id) on delete set null;

alter table public.expenses add column if not exists recurrence text not null default 'none';
alter table public.expenses drop constraint if exists expenses_recurrence_check;
alter table public.expenses add constraint expenses_recurrence_check
  check (recurrence in ('none', 'monthly'));
alter table public.expenses add column if not exists recurrence_group_id uuid;

create index if not exists trips_household_idx on public.trips (household_id, created_at desc);
create index if not exists transfers_household_paid_on_idx on public.transfers (household_id, paid_on desc);
create index if not exists transfers_trip_idx on public.transfers (trip_id);
create index if not exists expenses_trip_idx on public.expenses (trip_id);

alter table public.trips enable row level security;
alter table public.transfers enable row level security;

drop policy if exists trips_member_all on public.trips;
create policy trips_member_all on public.trips
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists transfers_member_all on public.transfers;
create policy transfers_member_all on public.transfers
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

do $$
begin
  raise notice 'Transferencias, viajes y recurrencia listos';
end;
$$;
