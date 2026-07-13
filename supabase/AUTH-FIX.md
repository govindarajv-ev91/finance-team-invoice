# Turn OFF Confirm email (current Supabase UI)

"Providers" was renamed. Use one of these paths.

## Option A — Direct link (easiest)

Open this (your project):

https://supabase.com/dashboard/project/xnjnuonhymjblynoxmgw/auth/providers

Then:
1. Click **Email** (email provider row)
2. Find **Confirm email**
3. Turn it **OFF**
4. Click **Save**

## Option B — Click through the menu

1. Go to https://supabase.com/dashboard and open project **xnjnuonhymjblynoxmgw**
2. Left sidebar → **Authentication**
3. Open **Sign In / Providers**  
   (sometimes labeled **Sign In / Up**, **Providers**, or under **Configuration**)
4. Click **Email**
5. Turn **Confirm email** **OFF** → **Save**

If you still do not see it, look under:
- **Authentication** → **Configuration** → **Providers** / **Email**
- Or search the dashboard for “Confirm email”

## After that — confirm old accounts

SQL Editor → run:

```sql
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email_confirmed_at is null;
```

Or: **Authentication** → **Users** → open the user → confirm / enable them if shown.

Then **Sign in** with the existing admin email (do not create the same account again).
