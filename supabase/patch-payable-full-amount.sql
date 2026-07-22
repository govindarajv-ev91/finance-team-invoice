-- Allow payable_percent = 100 for full invoice payment at creation
-- Run once in Supabase SQL Editor.

alter table public.tickets drop constraint if exists tickets_payable_percent_check;
alter table public.tickets
  add constraint tickets_payable_percent_check
  check (
    payable_percent is null
    or (payable_percent >= 20 and payable_percent <= 60)
    or payable_percent = 100
  );

comment on column public.tickets.payable_percent is 'Advance 20-60% or 100 for full invoice at creation';

notify pgrst, 'reload schema';
