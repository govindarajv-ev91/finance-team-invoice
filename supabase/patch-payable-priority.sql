-- Payable %, priority/SLA, cheque attachment, urgent remaining-pay request
-- Run in Supabase SQL Editor

alter table public.tickets
  add column if not exists purpose text,
  add column if not exists payable_percent numeric,
  add column if not exists payable_amount numeric,
  add column if not exists priority text not null default 'medium',
  add column if not exists due_at timestamptz,
  add column if not exists cheque_path text,
  add column if not exists cheque_name text,
  add column if not exists user_cheque_path text,
  add column if not exists user_cheque_name text,
  add column if not exists remaining_requested_at timestamptz,
  add column if not exists urgent boolean not null default false,
  add column if not exists approval_history text;

-- Priority values
alter table public.tickets drop constraint if exists tickets_priority_check;
alter table public.tickets
  add constraint tickets_priority_check
  check (priority in ('high', 'medium', 'low'));

-- Payable percent 20–60 when set (legacy rows may be null)
alter table public.tickets drop constraint if exists tickets_payable_percent_check;
alter table public.tickets
  add constraint tickets_payable_percent_check
  check (
    payable_percent is null
    or (payable_percent >= 20 and payable_percent <= 60)
    or payable_percent = 100
  );

-- Backfill due_at for existing rows (medium = +48h from created_at)
update public.tickets
set due_at = created_at + interval '48 hours'
where due_at is null;

-- Backfill payable_amount = full invoice for old tickets (no advance %)
update public.tickets
set payable_amount = amount
where payable_amount is null;

comment on column public.tickets.purpose is 'User purpose of payment';
comment on column public.tickets.payable_percent is 'Advance payable percent 20-60';
comment on column public.tickets.payable_amount is 'Amount approved/paid for this cycle (advance or full after remaining request)';
comment on column public.tickets.priority is 'high=same day, medium=48h, low=72h';
comment on column public.tickets.urgent is 'True when user requested remaining amount after advance paid';
comment on column public.tickets.user_cheque_path is 'User cancelled-cheque / cheque book attachment (bank proof at creation)';
comment on column public.tickets.cheque_path is 'Finance payment cheque attachment (last payment)';
