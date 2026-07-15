-- Email settings for app-side Google Apps Script mails (no Edge Function)
-- Run in Supabase SQL Editor

create table if not exists public.notification_settings (
  id int primary key default 1 check (id = 1),
  admin_emails text not null default '',
  finance_emails text not null default '',
  ceo_emails text not null default '',
  from_name text not null default 'VoicEV91 Finance',
  mail_webhook_url text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.notification_settings
  add column if not exists mail_webhook_url text not null default '';

insert into public.notification_settings (id, admin_emails, finance_emails, ceo_emails, mail_webhook_url)
values (1, '', '', '', '')
on conflict (id) do nothing;

alter table public.notification_settings enable row level security;

drop policy if exists "Authenticated can read notification settings" on public.notification_settings;
drop policy if exists "Admins manage notification settings" on public.notification_settings;

create policy "Authenticated can read notification settings"
  on public.notification_settings for select to authenticated
  using (true);

create policy "Admins manage notification settings"
  on public.notification_settings for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create table if not exists public.mail_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  ticket_code text,
  recipients text not null,
  subject text not null,
  status text not null default 'queued',
  error_message text,
  dedupe_key text,
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);

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

alter table public.mail_logs enable row level security;

drop policy if exists "Admins read mail logs" on public.mail_logs;
drop policy if exists "Authenticated read mail logs" on public.mail_logs;
drop policy if exists "Authenticated insert mail logs" on public.mail_logs;
drop policy if exists "Authenticated update mail logs" on public.mail_logs;

create policy "Authenticated read mail logs"
  on public.mail_logs for select to authenticated
  using (true);

create policy "Authenticated insert mail logs"
  on public.mail_logs for insert to authenticated
  with check (true);

create policy "Authenticated update mail logs"
  on public.mail_logs for update to authenticated
  using (true)
  with check (true);
