create table if not exists public.vehicle_trade_ins (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  offered_brand text not null,
  offered_model text not null,
  offered_version text,
  offered_year integer check (offered_year is null or (offered_year >= 1950 and offered_year <= 2100)),
  offered_kilometers integer check (offered_kilometers is null or offered_kilometers >= 0),
  cash_adjustment numeric(14,2) not null default 0 check (cash_adjustment >= 0),
  cash_adjustment_direction text not null default 'none'
    check (cash_adjustment_direction in ('none','to_us','to_customer')),
  currency text not null default 'USD' check (currency in ('USD','ARS')),
  trade_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_trade_ins_vehicle_id_idx
  on public.vehicle_trade_ins(vehicle_id);

create index if not exists vehicle_trade_ins_trade_date_idx
  on public.vehicle_trade_ins(trade_date desc);

alter table public.vehicle_trade_ins enable row level security;

drop policy if exists "admin vehicle trade ins all" on public.vehicle_trade_ins;
create policy "admin vehicle trade ins all"
on public.vehicle_trade_ins
for all
to authenticated
using (lower(auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com')
with check (lower(auth.jwt()->>'email') = 'sancristobalpabloignacio@gmail.com');
