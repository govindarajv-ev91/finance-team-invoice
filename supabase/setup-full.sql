-- ============================================================
-- VoicEV91 Finance Invoice — FULL SETUP (one file, run once)
-- Creates ALL tables/columns/policies current as of today.
-- Safe to re-run: uses IF NOT EXISTS / drop-and-recreate policies.
-- Run in: Supabase → SQL Editor → New query → paste ALL → Run
-- ============================================================

-- ---------- 1) PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'user',
  is_approved boolean not null default true,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  department_id uuid,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists is_approved boolean not null default true;
alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists approved_by uuid references public.profiles(id);
alter table public.profiles add column if not exists department_id uuid;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'team_head', 'finance', 'admin', 'ceo'));

-- ---------- 2) DEPARTMENTS ----------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  requires_team_head_approval boolean not null default false,
  team_head_emails text not null default '',
  created_at timestamptz not null default now()
);

alter table public.departments
  add column if not exists requires_team_head_approval boolean not null default false;
alter table public.departments
  add column if not exists team_head_emails text not null default '';

insert into public.departments (name) values
  ('Outsourcer'),
  ('Invent'),
  ('Operations'),
  ('Marketing')
on conflict (name) do nothing;

-- link profiles.department_id FK (after departments exists)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'profiles_department_id_fkey'
      and table_name = 'profiles'
  ) then
    alter table public.profiles
      add constraint profiles_department_id_fkey
      foreign key (department_id) references public.departments(id);
  end if;
end $$;

-- ---------- 3) TICKETS (all current columns) ----------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id),
  subject text not null,
  remark text,
  purpose text,
  amount numeric(12,2) not null check (amount > 0),
  payable_percent numeric,
  payable_amount numeric,
  priority text not null default 'medium',
  due_at timestamptz,
  invoice_number text,
  bank_name text,
  account_number text,
  ifsc_code text,
  bill_path text not null,
  bill_name text not null,
  cheque_path text,
  cheque_name text,
  user_cheque_path text,
  user_cheque_name text,
  status text not null default 'awaiting_ceo',
  urgent boolean not null default false,
  remaining_requested_at timestamptz,
  team_head_approved_by uuid references public.profiles(id),
  team_head_approved_by_name text,
  team_head_approved_at timestamptz,
  team_head_remark text,
  ceo_approved_by uuid references public.profiles(id),
  ceo_approved_by_name text,
  ceo_approved_at timestamptz,
  ceo_remark text,
  paid_by uuid references public.profiles(id),
  paid_by_name text,
  paid_amount numeric(12,2),
  utr_number text,
  paid_at timestamptz,
  last_payment_amount numeric(12,2),
  payment_history text,
  approval_history text,
  completion_remark text,
  completion_path text,
  completion_name text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- add any missing columns for older installs
alter table public.tickets add column if not exists purpose text;
alter table public.tickets add column if not exists payable_percent numeric;
alter table public.tickets add column if not exists payable_amount numeric;
alter table public.tickets add column if not exists priority text not null default 'medium';
alter table public.tickets add column if not exists due_at timestamptz;
alter table public.tickets add column if not exists invoice_number text;
alter table public.tickets add column if not exists bank_name text;
alter table public.tickets add column if not exists account_number text;
alter table public.tickets add column if not exists ifsc_code text;
alter table public.tickets add column if not exists cheque_path text;
alter table public.tickets add column if not exists cheque_name text;
alter table public.tickets add column if not exists user_cheque_path text;
alter table public.tickets add column if not exists user_cheque_name text;
alter table public.tickets add column if not exists urgent boolean not null default false;
alter table public.tickets add column if not exists remaining_requested_at timestamptz;
alter table public.tickets add column if not exists team_head_approved_by uuid references public.profiles(id);
alter table public.tickets add column if not exists team_head_approved_by_name text;
alter table public.tickets add column if not exists team_head_approved_at timestamptz;
alter table public.tickets add column if not exists team_head_remark text;
alter table public.tickets add column if not exists ceo_approved_by uuid references public.profiles(id);
alter table public.tickets add column if not exists ceo_approved_by_name text;
alter table public.tickets add column if not exists ceo_approved_at timestamptz;
alter table public.tickets add column if not exists ceo_remark text;
alter table public.tickets add column if not exists paid_amount numeric(12,2);
alter table public.tickets add column if not exists utr_number text;
alter table public.tickets add column if not exists last_payment_amount numeric(12,2);
alter table public.tickets add column if not exists payment_history text;
alter table public.tickets add column if not exists approval_history text;

alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets
  add constraint tickets_status_check
  check (status in (
    'awaiting_team_head', 'awaiting_ceo', 'pending',
    'partial', 'paid', 'completed', 'rejected'
  ));

alter table public.tickets drop constraint if exists tickets_priority_check;
alter table public.tickets
  add constraint tickets_priority_check
  check (priority in ('high', 'medium', 'low'));

alter table public.tickets drop constraint if exists tickets_payable_percent_check;
alter table public.tickets
  add constraint tickets_payable_percent_check
  check (
    payable_percent is null
    or (payable_percent >= 20 and payable_percent <= 60)
    or payable_percent = 100
  );

update public.tickets set due_at = created_at + interval '48 hours' where due_at is null;
update public.tickets set payable_amount = amount where payable_amount is null;

-- ---------- 4) TICKET COUNTER ----------
create table if not exists public.ticket_counters (
  id int primary key default 1 check (id = 1),
  last_number int not null default 0
);

insert into public.ticket_counters (id, last_number)
values (1, 0)
on conflict (id) do nothing;

-- ---------- 5) USER CREDENTIALS (admin directory) ----------
create table if not exists public.user_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null unique,
  password_text text not null,
  full_name text not null,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_credentials drop constraint if exists user_credentials_role_check;
alter table public.user_credentials
  add constraint user_credentials_role_check
  check (role in ('user', 'team_head', 'finance', 'admin', 'ceo'));

-- ---------- 6) EMAIL NOTIFICATIONS ----------
create table if not exists public.notification_settings (
  id int primary key default 1 check (id = 1),
  admin_emails text not null default '',
  finance_emails text not null default '',
  ceo_emails text not null default '',
  from_name text not null default 'VoicEV91 Finance',
  mail_webhook_url text not null default '',
  completion_reminder_days int not null default 3,
  completion_reminder_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.mail_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  ticket_code text,
  recipients text not null,
  subject text not null,
  status text not null default 'queued',
  error_message text,
  dedupe_key text not null,
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists mail_logs_dedupe_key_uidx
  on public.mail_logs (dedupe_key);

-- ---------- 7) SIGNUP TRIGGER (auto profile) ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_approved boolean;
  v_dept uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'user');
  if v_role not in ('user', 'team_head', 'finance', 'admin', 'ceo') then
    v_role := 'user';
  end if;
  v_approved := v_role <> 'user';

  begin
    v_dept := nullif(new.raw_user_meta_data->>'department_id', '')::uuid;
  exception when others then
    v_dept := null;
  end;

  insert into public.profiles (id, email, full_name, role, is_approved, approved_at, department_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_approved,
    case when v_approved then now() else null end,
    v_dept
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 8) STORAGE BUCKET ----------
insert into storage.buckets (id, name, public)
values ('invoice-files', 'invoice-files', true)
on conflict (id) do nothing;

-- ---------- 9) ROW LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_counters enable row level security;
alter table public.user_credentials enable row level security;
alter table public.notification_settings enable row level security;
alter table public.mail_logs enable row level security;

-- Profiles
drop policy if exists "Users can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can update any profile" on public.profiles;

create policy "Users can view all profiles"
  on public.profiles for select to authenticated using (true);

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

create policy "Admins can update any profile"
  on public.profiles for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Departments (public read so signup page can list them)
drop policy if exists "Anyone authenticated can read departments" on public.departments;
drop policy if exists "Public can read departments" on public.departments;
drop policy if exists "Anyone can read departments" on public.departments;
drop policy if exists "Admins can insert departments" on public.departments;
drop policy if exists "Admins can update departments" on public.departments;
drop policy if exists "Admins can delete departments" on public.departments;

create policy "Anyone can read departments"
  on public.departments for select using (true);

create policy "Admins can insert departments"
  on public.departments for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can update departments"
  on public.departments for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can delete departments"
  on public.departments for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Tickets
drop policy if exists "Users see own tickets; finance/admin see all" on public.tickets;
drop policy if exists "Users see own tickets; finance/admin/ceo see all" on public.tickets;
drop policy if exists "Users see own; staff see permitted tickets" on public.tickets;
drop policy if exists "Users can create own tickets" on public.tickets;
drop policy if exists "Users update own for complete; finance/admin update all" on public.tickets;
drop policy if exists "Users update own; finance/admin/ceo update all" on public.tickets;
drop policy if exists "Users update own; staff update permitted tickets" on public.tickets;

create policy "Users see own; staff see permitted tickets"
  on public.tickets for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('finance', 'admin', 'ceo')
          or (p.role = 'team_head' and p.department_id = tickets.department_id)
        )
    )
  );

create policy "Users can create own tickets"
  on public.tickets for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update own; staff update permitted tickets"
  on public.tickets for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('finance', 'admin', 'ceo')
          or (
            p.role = 'team_head'
            and p.department_id = tickets.department_id
            and tickets.status = 'awaiting_team_head'
          )
        )
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('finance', 'admin', 'ceo')
          or (
            p.role = 'team_head'
            and p.department_id = tickets.department_id
            and tickets.status in ('awaiting_ceo', 'rejected')
          )
        )
    )
  );

-- Ticket counters
drop policy if exists "Ticket counters readable by authenticated" on public.ticket_counters;
drop policy if exists "Ticket counters updatable by authenticated" on public.ticket_counters;

create policy "Ticket counters readable by authenticated"
  on public.ticket_counters for select to authenticated using (true);

create policy "Ticket counters updatable by authenticated"
  on public.ticket_counters for update to authenticated using (true);

-- User credentials
drop policy if exists "Admins can read credentials" on public.user_credentials;
drop policy if exists "Admins can insert credentials" on public.user_credentials;
drop policy if exists "Admins can update credentials" on public.user_credentials;
drop policy if exists "Admins can delete credentials" on public.user_credentials;
drop policy if exists "Users can insert own credentials" on public.user_credentials;
drop policy if exists "Users can update own credentials" on public.user_credentials;

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

-- Notification settings
drop policy if exists "Authenticated can read notification settings" on public.notification_settings;
drop policy if exists "Admins manage notification settings" on public.notification_settings;

create policy "Authenticated can read notification settings"
  on public.notification_settings for select to authenticated using (true);

create policy "Admins manage notification settings"
  on public.notification_settings for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Mail logs
drop policy if exists "Admins read mail logs" on public.mail_logs;
drop policy if exists "Authenticated read mail logs" on public.mail_logs;
drop policy if exists "Authenticated insert mail logs" on public.mail_logs;
drop policy if exists "Authenticated update mail logs" on public.mail_logs;

create policy "Authenticated read mail logs"
  on public.mail_logs for select to authenticated using (true);

create policy "Authenticated insert mail logs"
  on public.mail_logs for insert to authenticated with check (true);

create policy "Authenticated update mail logs"
  on public.mail_logs for update to authenticated
  using (true) with check (true);

-- Storage policies
drop policy if exists "Authenticated can upload invoice files" on storage.objects;
drop policy if exists "Authenticated can read invoice files" on storage.objects;
drop policy if exists "Public can read invoice files" on storage.objects;

create policy "Authenticated can upload invoice files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'invoice-files');

create policy "Authenticated can read invoice files"
  on storage.objects for select to authenticated
  using (bucket_id = 'invoice-files');

create policy "Public can read invoice files"
  on storage.objects for select to public
  using (bucket_id = 'invoice-files');

-- ---------- 10) RELOAD API SCHEMA CACHE ----------
-- Fixes PGRST204 "Could not find the 'xxx' column in the schema cache"
notify pgrst, 'reload schema';

-- ============================================================
-- DONE. All tables, columns, RLS, storage, and seed data ready.
-- ============================================================
