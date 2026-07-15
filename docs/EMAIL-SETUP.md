# VoicEV91 auto email — App Script (NO Edge Function)

Mails are sent from the **React app** using a free **Google Apps Script** + Gmail.
No Supabase Edge Function. No extra paid mail API required.

## Who gets mail

| Event | Recipients |
|--------|------------|
| Ticket created | User (from DB) + Admin + CEO + Finance |
| CEO approve | User + Admin + Finance + CEO |
| CEO reject | User + Admin + CEO |
| Finance pay | User + Admin + Finance + CEO |
| Process complete | User + Admin + Finance + CEO |
| User account approved | User + Admin |

- **User email** → from database `profiles.email`
- **Admin / Finance / CEO emails** → typed manually in Admin page

---

## Step 1 — SQL

Run in Supabase SQL Editor (both):

1. `supabase/patch-email-notifications.sql`
2. `supabase/patch-mail-logs-dedupe.sql` ← **required** (one ticket + one event = one mail_log)

Example: ticket `AWPBU003` created → only one row with key `AWPBU003:ticket_created`.
Later CEO approve → second row `AWPBU003:ceo_approved` (new event, allowed).
Duplicate create notify is blocked.

Track all sends in Admin → **Email alerts** → **Mail log tracker**.

---

## Step 2 — Google Apps Script (free)

1. Open https://script.google.com → **New project** (or existing)
2. Open file: `google-apps-script/VoicEV91-Mail.gs`
3. Copy all code → paste into Google Apps Script editor → Save
4. **Deploy** → **New deployment** (or Manage deployments → Edit → New version)
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click Deploy → copy the **Web app URL**
6. **Paste the NEW URL** in Admin → Email alerts → Save  
   (New deploy often changes the URL — old URL = no mail)

Quick test: open the Web app URL in a browser. You should see  
`{"ok":true,"service":"VoicEV91 mail webhook"}`  
If not, redeploy with access **Anyone**.

---

## Step 3 — App settings

Admin login → sidebar **Email alerts**:

1. Admin emails (example: `admin@company.com`)
2. Finance emails
3. CEO emails
4. **Google Apps Script URL** (paste the Web app URL)
5. Save

---

## Step 4 — Test

Create a ticket as User → check Admin / CEO / Finance / User inboxes.

If mail fails, check table `mail_logs` in Supabase.

---

## Notes

- Daily Gmail Apps Script free limit is high enough for internal team use.
- Use a Google account that can send mail (Workspace or Gmail).
- If Google asks permission for first send, approve it while logged into that account.
