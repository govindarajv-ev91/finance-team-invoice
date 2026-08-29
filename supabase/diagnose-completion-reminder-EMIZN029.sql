-- Diagnose why completion reminder may not send for a ticket (e.g. EMIZN029).
-- Run in Supabase SQL Editor.

-- 1) Ticket facts
select
  t.ticket_code,
  t.status,
  t.amount as invoice_amount,
  t.paid_amount,
  t.paid_at,
  extract(day from (now() - t.paid_at))::int as days_since_paid,
  extract(day from (now() - t.created_at))::int as days_since_created,
  case
    when t.status <> 'paid' then 'SKIP: status is not paid'
    when t.paid_at is null then 'SKIP: paid_at is null'
    when coalesce(t.paid_amount, 0) < coalesce(t.amount, 0) - 0.001 then 'SKIP: invoice not fully paid (paid_amount < amount)'
    when t.paid_at > now() - interval '3 days' then 'SKIP: paid less than 3 days ago (reminder uses paid_at, not created_at)'
    else 'ELIGIBLE for reminder (if Apps Script job is running)'
  end as reminder_check,
  p.email as user_email,
  p.full_name as user_name
from public.tickets t
left join public.profiles p on p.id = t.user_id
where t.ticket_code = 'EMIZN029';

-- 2) Reminder settings
select
  completion_reminder_enabled,
  completion_reminder_days,
  admin_emails,
  mail_webhook_url is not null and length(trim(mail_webhook_url)) > 0 as has_webhook
from public.notification_settings
where id = 1;

-- 3) Any reminder mails already logged for this ticket
select created_at, event_type, status, recipients, dedupe_key, error_message
from public.mail_logs
where ticket_code = 'EMIZN029'
  and event_type = 'completion_reminder'
order by created_at desc;
