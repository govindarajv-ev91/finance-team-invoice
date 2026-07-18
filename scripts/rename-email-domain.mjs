// Rename all @ev91.com login emails to @ev91riderz.com using the Supabase Admin API.
// The SQL editor cannot write to auth.users, but the service role key can.
//
// How to run:
//   1. Supabase Dashboard -> Project Settings -> API Keys -> copy the "service_role" (secret) key
//   2. In PowerShell, from the project folder:
//        $env:SUPABASE_SERVICE_ROLE_KEY="paste-key-here"
//        node scripts/rename-email-domain.mjs
//   3. Delete the key from your terminal history afterwards. NEVER put it in .env or the app.

import { createClient } from '@supabase/supabase-js'

const OLD_DOMAIN = '@ev91.com'
const NEW_DOMAIN = '@ev91riderz.com'

const url = 'https://xnjnuonhymjblynoxmgw.supabase.co'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. See instructions at the top of this file.')
  process.exit(1)
}

if (serviceKey.startsWith('sb_publishable_') || serviceKey.includes('anon')) {
  console.error(
    'You pasted the PUBLIC (publishable/anon) key. That key cannot manage users.\n' +
      'Copy the SECRET service_role key instead: Supabase Dashboard -> Project Settings -> API Keys -> service_role (secret) -> Reveal.\n' +
      'It usually starts with "sb_secret_".',
  )
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  let page = 1
  let renamed = 0

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const users = data?.users ?? []
    if (users.length === 0) break

    for (const user of users) {
      const email = user.email ?? ''
      if (!email.toLowerCase().endsWith(OLD_DOMAIN)) continue

      const newEmail = email.slice(0, -OLD_DOMAIN.length) + NEW_DOMAIN
      const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
        email: newEmail,
        email_confirm: true,
      })
      if (updErr) {
        console.error(`FAILED  ${email} -> ${newEmail}: ${updErr.message}`)
        continue
      }
      console.log(`Renamed ${email} -> ${newEmail}`)
      renamed += 1

      // keep the app tables in sync
      await admin.from('profiles').update({ email: newEmail }).eq('id', user.id)
      await admin.from('user_credentials').update({ email: newEmail }).eq('user_id', user.id)
    }

    if (users.length < 100) break
    page += 1
  }

  // notification recipient lists (comma-separated text)
  const { data: settings } = await admin
    .from('notification_settings')
    .select('id, admin_emails, finance_emails, ceo_emails')
    .eq('id', 1)
    .single()

  if (settings) {
    const fix = (v) => (v ?? '').split(OLD_DOMAIN).join(NEW_DOMAIN)
    await admin
      .from('notification_settings')
      .update({
        admin_emails: fix(settings.admin_emails),
        finance_emails: fix(settings.finance_emails),
        ceo_emails: fix(settings.ceo_emails),
      })
      .eq('id', 1)
    console.log('Notification recipient lists updated.')
  }

  console.log(`Done. ${renamed} account(s) renamed. Passwords are unchanged.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
