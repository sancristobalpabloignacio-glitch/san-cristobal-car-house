alter table public.vehicles
add column if not exists vehicle_category text not null default 'used'
check (vehicle_category in ('used','zero_km'));

update public.vehicles
set vehicle_category='used'
where vehicle_category is null;
