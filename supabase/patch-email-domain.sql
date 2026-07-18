-- Rename all @ev91.com accounts to @ev91riderz.com
--
-- IMPORTANT: the SQL editor CANNOT update auth.users (permission denied 42501).
-- Rename the LOGIN emails with the Admin API script instead:
--   scripts/rename-email-domain.mjs  (instructions at the top of that file)
-- That script also syncs profiles / user_credentials / notification_settings,
-- so normally you do NOT need this file at all.
--
-- Use this file only if the script already renamed logins but the app tables
-- somehow still show the old domain.

-- 3. App profiles
update public.profiles
set email = replace(email, '@ev91.com', '@ev91riderz.com')
where email like '%@ev91.com';

-- 4. Stored credentials (admin view)
update public.user_credentials
set email = replace(email, '@ev91.com', '@ev91riderz.com')
where email like '%@ev91.com';

-- 5. Notification recipient lists (admin/finance/ceo emails)
update public.notification_settings
set admin_emails = replace(coalesce(admin_emails, ''), '@ev91.com', '@ev91riderz.com'),
    finance_emails = replace(coalesce(finance_emails, ''), '@ev91.com', '@ev91riderz.com'),
    ceo_emails = replace(coalesce(ceo_emails, ''), '@ev91.com', '@ev91riderz.com');

-- 6. Make sure renamed accounts are confirmed (avoids "Email not confirmed")
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email like '%@ev91riderz.com';

-- 7. Verify: should list all renamed users
select id, email, email_confirmed_at from auth.users order by email;
