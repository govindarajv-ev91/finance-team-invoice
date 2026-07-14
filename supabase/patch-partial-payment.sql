-- Partial payment support
-- Run once in Supabase SQL Editor

alter table public.tickets
  drop constraint if exists tickets_status_check;

alter table public.tickets
  add constraint tickets_status_check
  check (status in ('awaiting_ceo', 'pending', 'partial', 'paid', 'completed', 'rejected'));

-- paid_amount already exists; it will store TOTAL paid so far
-- Optional last payment note
alter table public.tickets add column if not exists last_payment_amount numeric(12,2);
alter table public.tickets add column if not exists payment_history text;
