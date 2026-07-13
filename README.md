# VoicEV91 — Finance Invoice Process

Light-green web app for invoice tickets: users submit bills, finance pays them, users close completed tickets. Admin manages departments, roles, and a status dashboard.

## Setup

1. **Install & run**

```bash
npm install
npm run dev
```

2. **Supabase database**

Open your project → **SQL Editor** → paste and run `supabase/schema.sql`.

Also confirm in **Authentication → Providers** that Email is enabled.

**Important:** In **Authentication → Providers → Email**, turn **OFF** “Confirm email” so login works without a confirmation link. If an account already shows “Email not confirmed”, run `supabase/confirm-emails.sql` once.

In **Storage**, the script creates bucket `invoice-files` (public read for bill links).

3. **Env** (already in `.env`)

- `VITE_SUPABASE_URL=https://xnjnuonhymjblynoxmgw.supabase.co`
- `VITE_SUPABASE_ANON_KEY=…`

## Roles

| Role | Access |
|------|--------|
| **User** | Create tickets, Process Complete for paid items |
| **Finance** | Review bills, mark Pay with finance name confirmation |
| **Admin** | Status dashboard, departments, user roles |

Create the first accounts via **Sign up** (choose account type). Promote users from **Admin → All users**.

## Ticket flow

1. User selects department, subject, amount, attaches bill → **Save** → popup with 8-character ticket ID (`ABCDE001`).
2. Finance opens the bill → **Pay** → enters finance team member name (required) → status becomes **Paid**.
3. User sidebar shows paid tickets → **Process Complete** → attachment + optional remarks → **Completed**.

## Note on passwords

Passwords are stored by Supabase Auth (hashed). They cannot be shown again in the admin UI. Users reset via Supabase Auth if needed.
