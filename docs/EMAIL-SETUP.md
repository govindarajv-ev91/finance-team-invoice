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
| Remaining amount requested (urgent) | User + Admin + CEO + Finance |
| Completion reminder (paid, not completed 3+ days) | Ticket owner **and** Admin + Finance + Team Head + CEO (each person gets their own email) |

- **User email** → from database `profiles.email`
- **Admin / Finance / CEO emails** → typed manually in Admin page

---

## Step 1 — SQL

Run in Supabase SQL Editor (both):

1. `supabase/patch-email-notifications.sql`
2. `supabase/patch-mail-logs-dedupe.sql` ← **required** (one ticket + one event = one mail_log)
3. `supabase/patch-completion-reminder.sql` ← **required** for auto completion reminders

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

### Completion reminder (daily auto mail)

When Finance has fully paid a ticket but the user has **not** clicked **Process Complete** for **3 days** (configurable in Admin), the user gets a reminder email. Repeats once per day until the ticket is completed.

1. At the **top** of `VoicEV91-Mail.gs`, paste your **service_role SECRET** key into `VOICEV91_SERVICE_ROLE_KEY`
   - **NOT** the value from `.env` (`VITE_SUPABASE_ANON_KEY` / `sb_publishable_...`) — that is the wrong key
   - Open: https://supabase.com/dashboard/project/xnjnuonhymjblynoxmgw/settings/api
   - Copy **service_role** → **Reveal** (starts with `eyJ...` or `sb_secret_...`)
2. **Save** → Run **once**: `configureSupabaseOnce()`
   - If stuck, run `showWhichSupabaseKeyToUse()` and read the Execution log
3. Run **once**: `installDailyCompletionReminderTrigger()` (runs daily ~9 AM)
4. Admin → **Email alerts** → set **Remind after (days)** (default 3) → Save  
5. **Deploy → New version** after every `.gs` paste, then paste the new `/exec` URL in Admin if it changed.
6. Optional: click **Send completion reminders now** — a Mail log row is written for each ticket, then Gmail sends **one separate email per person** (User + Admin + Finance + Team Head + CEO).
7. Or test from Apps Script: `showSupabaseConfigStatus()` then `testCompletionReminders()`. To prove others receive mail, run `testSendToOneOtherPerson()`.

Tickets like `EMIZN029` in status **Paid — Awaiting Complete** are included. Tracked in **Mail log tracker** as `completion_reminder`.

### Why Mail log listed 6 people but only Admin received mail

The Mail log line `6: gowtham.s@..., govindaraj.v@..., …` is the **planned list from the app**, not proof Gmail delivered to all six.

Apps Script sends **from the Google account that owns the Web App** (usually Admin `govindaraj.v@ev91riderz.com`). That account always sees the message (Inbox or Sent). Older Web App versions put everyone in **one** To/Bcc line. Google Workspace frequently **delivers that message only to the script owner** and drops the rest — without marking the log as failed.

The script now sends **six separate To: mails** (one address each) with a line `This copy is for: their@email`. After you paste the new `VoicEV91-Mail.gs` and deploy a **New version**, each person should get their own copy. Check **Spam** too. In Apps Script → **Executions**, you should see `SENT ok to=` for every address.

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
