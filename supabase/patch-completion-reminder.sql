-- Completion reminder settings (paid tickets not marked complete after N days)
-- Run in Supabase SQL Editor.

alter table public.notification_settings
  add column if not exists completion_reminder_days int not null default 3,
  add column if not exists completion_reminder_enabled boolean not null default true;

comment on column public.notification_settings.completion_reminder_days is
  'Send reminder when a fully-paid ticket stays in status=paid this many days without Process Complete.';

comment on column public.notification_settings.completion_reminder_enabled is
  'When false, the daily Google Apps Script reminder job skips sending.';

notify pgrst, 'reload schema';
