-- VoicEV91 — Approvals + bank fields + UTR
-- Run this once in Supabase SQL Editor

-- 1) Profile approval + CEO role
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'finance', 'admin', 'ceo'));

alter table public.profiles
  add column if not exists is_approved boolean not null default true;

alter table public.profiles
  add column if not exists approved_at timestamptz;

alter table public.profiles
  add column if not exists approved_by uuid references public.profiles(id);

-- New public signups (role=user) start unapproved
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_approved boolean;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'user');
  if v_role not in ('user', 'finance', 'admin', 'ceo') then
    v_role := 'user';
  end if;
  -- Only public users need admin approval
  v_approved := v_role <> 'user';

  insert into public.profiles (id, email, full_name, role, is_approved, approved_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_approved,
    case when v_approved then now() else null end
  );
  return new;
end;
$$;

-- 2) Ticket status: awaiting_ceo → pending → paid → completed
alter table public.tickets
  drop constraint if exists tickets_status_check;

alter table public.tickets
  add constraint tickets_status_check
  check (status in ('awaiting_ceo', 'pending', 'paid', 'completed', 'rejected'));

-- Bank / invoice fields on ticket create
alter table public.tickets add column if not exists invoice_number text;
alter table public.tickets add column if not exists bank_name text;
alter table public.tickets add column if not exists account_number text;
alter table public.tickets add column if not exists ifsc_code text;

-- CEO approval fields
alter table public.tickets add column if not exists ceo_approved_by uuid references public.profiles(id);
alter table public.tickets add column if not exists ceo_approved_by_name text;
alter table public.tickets add column if not exists ceo_approved_at timestamptz;
alter table public.tickets add column if not exists ceo_remark text;

-- Finance pay extra fields
alter table public.tickets add column if not exists paid_amount numeric(12,2);
alter table public.tickets add column if not exists utr_number text;

-- Credentials role check for ceo
alter table public.user_credentials
  drop constraint if exists user_credentials_role_check;

alter table public.user_credentials
  add constraint user_credentials_role_check
  check (role in ('user', 'finance', 'admin', 'ceo'));

-- Migrate old pending tickets (if any) — keep as pending for finance
-- New tickets will use awaiting_ceo

-- Allow CEO to see/update tickets (same as finance/admin)
drop policy if exists "Users see own tickets; finance/admin see all" on public.tickets;
create policy "Users see own tickets; finance/admin/ceo see all"
  on public.tickets for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('finance', 'admin', 'ceo')
    )
  );

drop policy if exists "Users update own for complete; finance/admin update all" on public.tickets;
create policy "Users update own; finance/admin/ceo update all"
  on public.tickets for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('finance', 'admin', 'ceo')
    )
  );
