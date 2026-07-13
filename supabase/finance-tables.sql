-- VoicEV91 — Finance Invoice tables
-- Run once in Supabase → SQL Editor

-- 1) Profiles (users / finance / admin)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'user' check (role in ('user', 'finance', 'admin')),
  created_at timestamptz not null default now()
);

-- 2) Departments
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 3) Finance tickets / invoices (main finance table)
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id),
  subject text not null,
  remark text,
  amount numeric(12,2) not null check (amount > 0),
  bill_path text not null,
  bill_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'completed')),
  paid_by uuid references public.profiles(id),
  paid_by_name text,
  paid_at timestamptz,
  completion_remark text,
  completion_path text,
  completion_name text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4) Ticket number counter (ABCDE001, ABCDE002, ...)
create table if not exists public.ticket_counters (
  id int primary key default 1 check (id = 1),
  last_number int not null default 0
);

insert into public.ticket_counters (id, last_number)
values (1, 0)
on conflict (id) do nothing;

-- 5) Admin user ID + password list
create table if not exists public.user_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique,
  password_text text not null,
  full_name text not null,
  role text not null default 'user' check (role in ('user', 'finance', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed departments
insert into public.departments (name) values
  ('Outsourcer'),
  ('Invent'),
  ('Operations'),
  ('Marketing')
on conflict (name) do nothing;

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage for bills
insert into storage.buckets (id, name, public)
values ('invoice-files', 'invoice-files', true)
on conflict (id) do nothing;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_counters enable row level security;
alter table public.user_credentials enable row level security;

-- Policies (safe to re-run)
drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can update any profile" on public.profiles;
drop policy if exists "Anyone authenticated can read departments" on public.departments;
drop policy if exists "Admins can insert departments" on public.departments;
drop policy if exists "Admins can update departments" on public.departments;
drop policy if exists "Admins can delete departments" on public.departments;
drop policy if exists "Users see own tickets; finance/admin see all" on public.tickets;
drop policy if exists "Users can create own tickets" on public.tickets;
drop policy if exists "Users update own for complete; finance/admin update all" on public.tickets;
drop policy if exists "Ticket counters readable by authenticated" on public.ticket_counters;
drop policy if exists "Ticket counters updatable by authenticated" on public.ticket_counters;
drop policy if exists "Admins can read credentials" on public.user_credentials;
drop policy if exists "Admins can insert credentials" on public.user_credentials;
drop policy if exists "Admins can update credentials" on public.user_credentials;
drop policy if exists "Admins can delete credentials" on public.user_credentials;
drop policy if exists "Users can insert own credentials" on public.user_credentials;
drop policy if exists "Users can update own credentials" on public.user_credentials;
drop policy if exists "Authenticated can upload invoice files" on storage.objects;
drop policy if exists "Authenticated can read invoice files" on storage.objects;
drop policy if exists "Public can read invoice files" on storage.objects;

create policy "Users can view all profiles"
  on public.profiles for select to authenticated using (true);

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

create policy "Admins can update any profile"
  on public.profiles for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Anyone authenticated can read departments"
  on public.departments for select to authenticated using (true);

create policy "Admins can insert departments"
  on public.departments for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can update departments"
  on public.departments for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can delete departments"
  on public.departments for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Users see own tickets; finance/admin see all"
  on public.tickets for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('finance', 'admin'))
  );

create policy "Users can create own tickets"
  on public.tickets for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update own for complete; finance/admin update all"
  on public.tickets for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('finance', 'admin'))
  );

create policy "Ticket counters readable by authenticated"
  on public.ticket_counters for select to authenticated using (true);

create policy "Ticket counters updatable by authenticated"
  on public.ticket_counters for update to authenticated using (true);

create policy "Admins can read credentials"
  on public.user_credentials for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can insert credentials"
  on public.user_credentials for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or user_id = auth.uid()
  );

create policy "Admins can update credentials"
  on public.user_credentials for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or user_id = auth.uid()
  );

create policy "Admins can delete credentials"
  on public.user_credentials for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Users can insert own credentials"
  on public.user_credentials for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own credentials"
  on public.user_credentials for update to authenticated
  using (user_id = auth.uid());

create policy "Authenticated can upload invoice files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'invoice-files');

create policy "Authenticated can read invoice files"
  on storage.objects for select to authenticated
  using (bucket_id = 'invoice-files');

create policy "Public can read invoice files"
  on storage.objects for select to public
  using (bucket_id = 'invoice-files');
