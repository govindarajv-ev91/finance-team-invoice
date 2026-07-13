-- Run this in Supabase SQL Editor (patch for admin password list + safe re-runs)

create table if not exists public.user_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique,
  password_text text not null,
  full_name text not null,
  role text not null default 'user' check (role in ('user', 'finance', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_credentials enable row level security;

drop policy if exists "Admins can read credentials" on public.user_credentials;
drop policy if exists "Admins can insert credentials" on public.user_credentials;
drop policy if exists "Admins can update credentials" on public.user_credentials;
drop policy if exists "Admins can delete credentials" on public.user_credentials;
drop policy if exists "Users can insert own credentials" on public.user_credentials;
drop policy if exists "Users can update own credentials" on public.user_credentials;

create policy "Admins can read credentials"
  on public.user_credentials for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

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
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Users can insert own credentials"
  on public.user_credentials for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own credentials"
  on public.user_credentials for update to authenticated
  using (user_id = auth.uid());
