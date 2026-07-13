-- VoicEV91 Auth fix — run this in Supabase SQL Editor
-- Fixes "Email not confirmed" for accounts already created

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;
