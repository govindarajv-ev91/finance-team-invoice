-- Fix mail_logs so User/CEO/Finance can dedupe + retry failed/queued mails
-- Run in Supabase SQL Editor

alter table public.mail_logs
  add column if not exists dedupe_key text,
  add column if not exists recipient_count int not null default 0;

update public.mail_logs
set dedupe_key = coalesce(ticket_code, 'none') || ':' || event_type || ':' || id::text
where dedupe_key is null;

alter table public.mail_logs
  alter column dedupe_key set not null;

create unique index if not exists mail_logs_dedupe_key_uidx
  on public.mail_logs (dedupe_key);

-- Allow all logged-in roles to read logs (needed for dedupe check before send)
drop policy if exists "Admins read mail logs" on public.mail_logs;
drop policy if exists "Authenticated read mail logs" on public.mail_logs;
create policy "Authenticated read mail logs"
  on public.mail_logs for select to authenticated
  using (true);

drop policy if exists "Authenticated insert mail logs" on public.mail_logs;
create policy "Authenticated insert mail logs"
  on public.mail_logs for insert to authenticated
  with check (true);

drop policy if exists "Authenticated update mail logs" on public.mail_logs;
create policy "Authenticated update mail logs"
  on public.mail_logs for update to authenticated
  using (true)
  with check (true);

-- Unblock retries: earlier bug left rows as queued without sending mail
update public.mail_logs
set status = 'failed',
    error_message = coalesce(error_message, 'Reset for retry after RLS/select fix')
where status = 'queued';
