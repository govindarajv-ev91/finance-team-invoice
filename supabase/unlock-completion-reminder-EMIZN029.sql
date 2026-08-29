-- Unlock EMIZN029 completion reminder so Admin can Retry / re-send today.
-- Safe: does NOT delete the row — only resets status.

update public.mail_logs
set
  status = 'queued',
  error_message = 'Manual unlock for retry (inbox empty)'
where dedupe_key = 'EMIZN029:completion_reminder:2026-08-10';

select id, ticket_code, event_type, status, recipients, dedupe_key, error_message
from public.mail_logs
where ticket_code = 'EMIZN029'
  and event_type = 'completion_reminder'
order by created_at desc;
