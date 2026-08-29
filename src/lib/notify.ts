import { supabase } from './supabase'
import { buildGreenMailTemplate, type MailEvent } from './emailTemplate'
import { isInvoiceFullyPaid } from './helpers'
import type { Ticket } from '../types/database'

export type { MailEvent }

interface NotifyInput {
  event: MailEvent
  ticket?: Ticket | null
  userEmail?: string | null
  userName?: string | null
  extra?: string
  /** Extra uniqueness for repeatable events (e.g. UTR for each payment). */
  dedupeSuffix?: string | null
  /** Ignore today's sent flag and try Gmail again (Admin Send now / Retry). */
  force?: boolean
}

interface MailSettings {
  admin_emails: string
  finance_emails: string
  ceo_emails: string
  from_name: string
  mail_webhook_url: string
}

/** Prevents double-click double calls in the same browser session. */
const inFlight = new Set<string>()

function splitEmails(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
}

function unique(list: string[]): string[] {
  return [...new Set(list)]
}

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '23505' || /duplicate|unique/i.test(err.message || '')
}

function buildDedupeKey(input: NotifyInput): string {
  const code = (input.ticket?.ticket_code || 'none').trim().toUpperCase()
  const suffix = (input.dedupeSuffix || '').trim()

  switch (input.event) {
    case 'user_approved':
      return `user_approved:${(input.userEmail || 'unknown').trim().toLowerCase()}`
    case 'payment_made':
      return `${code}:payment_made:${suffix || 'unknown'}`
    case 'remaining_requested':
      return `${code}:remaining_requested:${suffix || '1'}`
    case 'completion_reminder':
      return `${code}:completion_reminder:${suffix || '1'}`
    case 'team_head_approved':
    case 'team_head_rejected':
    case 'ceo_approved':
    case 'ceo_rejected':
      return `${code}:${input.event}:${suffix || '1'}`
    default:
      return `${code}:${input.event}`
  }
}

function buildMessage(input: NotifyInput): { subject: string; text: string; html: string } {
  return buildGreenMailTemplate({
    event: input.event,
    ticket: input.ticket,
    userName: input.userName,
    userEmail: input.userEmail,
    extra: input.extra,
  })
}

function recipientsFor(
  event: MailEvent,
  settings: MailSettings,
  ticket?: Ticket | null,
  userEmail?: string | null,
): string[] {
  const admin = splitEmails(settings.admin_emails)
  const finance = splitEmails(settings.finance_emails)
  const ceo = splitEmails(settings.ceo_emails)
  const user = splitEmails(userEmail)
  const teamHead = splitEmails(ticket?.departments?.team_head_emails)
  // Route by the ticket's actual status: a Team Head creating their own
  // ticket skips their queue and goes straight to the CEO.
  const requiresTeamHead = ticket?.status === 'awaiting_team_head'

  switch (event) {
    case 'ticket_created':
      return requiresTeamHead
        ? unique([...user, ...admin, ...teamHead])
        : unique([...user, ...admin, ...ceo])
    case 'team_head_approved':
      return unique([...user, ...admin, ...teamHead, ...ceo])
    case 'team_head_rejected':
      return unique([...user, ...admin, ...teamHead])
    case 'ceo_approved':
      return unique([...user, ...admin, ...finance, ...ceo])
    case 'ceo_rejected':
      return unique([...user, ...admin, ...ceo])
    case 'payment_made':
      return unique([...user, ...admin, ...finance, ...ceo])
    case 'ticket_completed':
      return unique([...user, ...admin, ...finance, ...ceo])
    case 'remaining_requested':
      return requiresTeamHead
        ? unique([...user, ...admin, ...teamHead])
        : unique([...user, ...admin, ...ceo])
    case 'completion_reminder':
      // Ticket owner + Admin + Finance + department Team Head + CEO
      return unique([...user, ...admin, ...finance, ...teamHead, ...ceo])
    case 'user_approved':
      return unique([...user, ...admin])
    default:
      return unique([...user, ...admin])
  }
}

async function markLog(
  dedupeKey: string,
  patch: {
    status: string
    error_message?: string | null
    recipients?: string
    recipient_count?: number
  },
): Promise<void> {
  await supabase.from('mail_logs').update(patch).eq('dedupe_key', dedupeKey)
}

/** Only Apps Script doPost/doGet reminder job returns sent/mail_sent. Health-check `{ok:true,service}` must NOT count. */
function webhookConfirmsMailSent(parsed: Record<string, unknown> | null | undefined): boolean {
  if (!parsed) return false
  if (parsed.mail_sent === true) return true
  if (typeof parsed.sent === 'number' && parsed.sent > 0) return true
  return false
}

/**
 * App-side mail (Google Apps Script).
 * One ticket + one event = one successful send (dedupe_key).
 * Stuck queued/failed rows are allowed to retry.
 */
export async function notifyTicket(
  input: NotifyInput,
): Promise<{ ok: boolean; status: string; error?: string; recipients?: string }> {
  const dedupeKey = buildDedupeKey(input)
  if (inFlight.has(dedupeKey)) {
    return { ok: false, status: 'skipped', error: 'Send already in progress for this key' }
  }
  inFlight.add(dedupeKey)

  try {
    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('admin_emails, finance_emails, ceo_emails, from_name, mail_webhook_url')
      .eq('id', 1)
      .maybeSingle()

    if (settingsError || !settings) {
      console.warn('Email settings missing. Run patch-email-notifications.sql and set emails in Admin.')
      return { ok: false, status: 'failed', error: 'Email settings missing' }
    }

    const webhook = (settings.mail_webhook_url || '').trim()
    if (!webhook) {
      console.warn('mail_webhook_url empty. Paste Google Apps Script Web App URL in Admin → Email alerts.')
      return { ok: false, status: 'failed', error: 'Google Apps Script URL is empty' }
    }

    const userEmail = input.userEmail || input.ticket?.profiles?.email || null
    const to = recipientsFor(input.event, settings as MailSettings, input.ticket, userEmail)
    const message = buildMessage(input)

    if (to.length === 0) {
      await supabase.from('mail_logs').upsert(
        {
          event_type: input.event,
          ticket_code: input.ticket?.ticket_code ?? null,
          recipients: '(none)',
          subject: message.subject,
          status: 'skipped',
          error_message: 'No recipients configured',
          dedupe_key: dedupeKey,
          recipient_count: 0,
        },
        { onConflict: 'dedupe_key' },
      )
      return { ok: false, status: 'skipped', error: 'No recipients configured' }
    }

    const { data: existing } = await supabase
      .from('mail_logs')
      .select('id, status')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle()

    if (existing?.status === 'sent' && !input.force) {
      console.info('Skip duplicate mail (already sent):', dedupeKey)
      return { ok: true, status: 'skipped_duplicate', recipients: to.join(', ') }
    }

    // Always write a row so Mail log tracker has data after Send now.
    if (existing) {
      let upd = supabase
        .from('mail_logs')
        .update({
          event_type: input.event,
          ticket_code: input.ticket?.ticket_code ?? null,
          recipients: to.join(', '),
          subject: message.subject,
          status: 'queued',
          error_message: input.force ? 'Admin retry — sending via Apps Script' : null,
          recipient_count: to.length,
        })
        .eq('dedupe_key', dedupeKey)
      if (!input.force) upd = upd.neq('status', 'sent')
      const { error: updErr } = await upd
      if (updErr) {
        console.warn('mail_logs update failed:', updErr.message)
      }
    } else {
      const { error: claimError } = await supabase.from('mail_logs').insert({
        event_type: input.event,
        ticket_code: input.ticket?.ticket_code ?? null,
        recipients: to.join(', '),
        subject: message.subject,
        status: 'queued',
        error_message: null,
        dedupe_key: dedupeKey,
        recipient_count: to.length,
      })

      if (claimError) {
        if (isUniqueViolation(claimError)) {
          // Race: another tab already claimed. Re-check status.
          const { data: again } = await supabase
            .from('mail_logs')
            .select('status')
            .eq('dedupe_key', dedupeKey)
            .maybeSingle()
          if (again?.status === 'sent' && !input.force) {
            return { ok: true, status: 'skipped_duplicate' }
          }
        } else {
          console.warn('mail_logs claim failed (still sending mail):', claimError.message)
        }
      }
    }

    const res = await fetch(webhook, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        fromName: settings.from_name || 'VoicEV91 Finance',
        event: input.event,
        ticket_code: input.ticket?.ticket_code,
        dedupe_key: dedupeKey,
      }),
    })

    const text = await res.text()
    let ok = false
    let errMsg: string | null = null
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      if (webhookConfirmsMailSent(parsed)) {
        ok = true
        const failedList = parsed.failed
        if (Array.isArray(failedList) && failedList.length) {
          errMsg = `Partial send (${String(parsed.sent)}/${to.length}): ${failedList.join('; ')}`.slice(
            0,
            500,
          )
        }
      } else if (parsed.service && parsed.mail_sent !== true) {
        ok = false
        errMsg =
          'Apps Script did not send mail (health-check reply only). Deploy Web app: Execute as Me, Who has access = Anyone, then paste the NEW /exec URL in Admin.'
      } else {
        ok = false
        errMsg = String(parsed.error || text).slice(0, 500)
      }
    } catch {
      ok = false
      errMsg =
        'Mail webhook did not return JSON. Redeploy Apps Script as Web app (Anyone) and paste the NEW URL in Admin. Response: ' +
        text.slice(0, 200)
    }

    if (!res.ok && !ok) {
      errMsg = errMsg || `HTTP ${res.status}: ${text.slice(0, 300)}`
    }

    await markLog(dedupeKey, {
      status: ok ? 'sent' : 'failed',
      error_message: errMsg || (ok ? null : text.slice(0, 500)),
      recipients: to.join(', '),
      recipient_count: to.length,
    })
    return {
      ok,
      status: ok ? 'sent' : 'failed',
      error: ok ? undefined : errMsg || undefined,
      recipients: to.join(', '),
    }
  } catch (err) {
    console.warn('Email notify error:', err)
    const error = String(err).slice(0, 500)
    try {
      await markLog(dedupeKey, {
        status: 'failed',
        error_message: error,
      })
    } catch {
      // ignore
    }
    return { ok: false, status: 'failed', error }
  } finally {
    inFlight.delete(dedupeKey)
  }
}

function todayKeyLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface CompletionReminderRunResult {
  ok: boolean
  message: string
  reminderDays: number
  eligible: number
  attempted: number
  alreadySentToday: number
  skippedNoEmail: number
  ticketCodes: string[]
}

/**
 * Manual / Admin trigger: write Mail log rows and POST each reminder through the
 * same Apps Script webhook used for ticket_created / payment_made.
 */
export async function runCompletionRemindersNow(): Promise<CompletionReminderRunResult> {
  const empty = (
    ok: boolean,
    message: string,
    reminderDays = 3,
  ): CompletionReminderRunResult => ({
    ok,
    message,
    reminderDays,
    eligible: 0,
    attempted: 0,
    alreadySentToday: 0,
    skippedNoEmail: 0,
    ticketCodes: [],
  })

  const { data: settings, error: settingsError } = await supabase
    .from('notification_settings')
    .select(
      'admin_emails, finance_emails, ceo_emails, from_name, mail_webhook_url, completion_reminder_days, completion_reminder_enabled',
    )
    .eq('id', 1)
    .maybeSingle()

  if (settingsError) {
    return empty(
      false,
      settingsError.message.includes('completion_reminder')
        ? 'Run supabase/patch-completion-reminder.sql in Supabase first.'
        : settingsError.message,
    )
  }

  if (!settings) {
    return empty(false, 'Email settings missing. Configure Admin → Email alerts.')
  }

  if (settings.completion_reminder_enabled === false) {
    return empty(
      false,
      'Completion reminders are disabled. Turn them on and Save first.',
      Number(settings.completion_reminder_days) || 3,
    )
  }

  const webhook = (settings.mail_webhook_url || '').trim()
  if (!webhook) {
    return empty(
      false,
      'Google Apps Script URL is empty. Paste it in Email alerts and Save.',
      Number(settings.completion_reminder_days) || 3,
    )
  }

  let reminderDays = Number(settings.completion_reminder_days)
  if (!Number.isFinite(reminderDays) || reminderDays < 1) reminderDays = 3

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - reminderDays)
  const cutoffIso = cutoff.toISOString()

  const { data: rows, error: ticketError } = await supabase
    .from('tickets')
    .select('*, profiles!user_id(*), departments(*)')
    .eq('status', 'paid')
    .not('paid_at', 'is', null)
    .lte('paid_at', cutoffIso)
    .order('paid_at', { ascending: true })

  if (ticketError) {
    return empty(false, ticketError.message, reminderDays)
  }

  const todayKey = todayKeyLocal()
  let sentOk = 0
  let failed = 0
  let skippedNoEmail = 0
  const ticketCodes: string[] = []
  const failNotes: string[] = []

  for (const ticket of (rows as Ticket[]) ?? []) {
    if (!isInvoiceFullyPaid(ticket)) continue
    const code = (ticket.ticket_code || '').trim().toUpperCase()
    if (!code) continue
    ticketCodes.push(code)

    const userEmail = ticket.profiles?.email?.trim() || null
    if (!userEmail) {
      skippedNoEmail++
      await supabase.from('mail_logs').upsert(
        {
          event_type: 'completion_reminder',
          ticket_code: code,
          recipients: '(none)',
          subject: `Reminder — complete ticket ${code}`,
          status: 'skipped',
          error_message: 'User profile has no email',
          dedupe_key: `${code}:completion_reminder:${todayKey}`,
          recipient_count: 0,
        },
        { onConflict: 'dedupe_key' },
      )
      continue
    }

    const daysWaiting = ticket.paid_at
      ? Math.floor((Date.now() - new Date(ticket.paid_at).getTime()) / (24 * 60 * 60 * 1000))
      : 0

    const result = await notifyTicket({
      event: 'completion_reminder',
      ticket,
      userEmail,
      userName: ticket.profiles?.full_name,
      extra: `Paid ${daysWaiting} day(s) ago — please mark Process Complete. Sent to User, Admin, Finance, Team Head and CEO.`,
      dedupeSuffix: todayKey,
      force: true,
    })

    if (result.ok && result.status === 'sent') sentOk++
    else {
      failed++
      if (result.error) failNotes.push(`${code}: ${result.error}`)
    }
  }

  if (ticketCodes.length === 0) {
    return {
      ok: true,
      message: `No eligible tickets (paid ${reminderDays}+ days ago, still awaiting Process Complete).`,
      reminderDays,
      eligible: 0,
      attempted: 0,
      alreadySentToday: 0,
      skippedNoEmail: 0,
      ticketCodes: [],
    }
  }

  const ok = sentOk > 0 && failed === 0
  const failHint = failNotes[0] ? ` ${failNotes[0]}` : ''
  return {
    ok,
    message:
      `Mail log updated for ${ticketCodes.length} ticket(s). Confirmed Gmail send: ${sentOk}. Failed: ${failed}. Missing user email: ${skippedNoEmail}. Recipients: User + Admin + Finance + Team Head + CEO.` +
      (failed > 0
        ? ` Check each row’s error in Mail log tracker.${failHint}`
        : ' Refresh Mail log tracker if a row is not visible yet.'),
    reminderDays,
    eligible: ticketCodes.length,
    attempted: sentOk,
    alreadySentToday: 0,
    skippedNoEmail,
    ticketCodes,
  }
}

/** Allow Admin to retry a mail that was marked sent/failed (clears block on dedupe_key). */
export async function retryMailLogSend(dedupeKey: string): Promise<{ ok: boolean; message: string }> {
  const key = dedupeKey.trim()
  if (!key) {
    return { ok: false, message: 'Missing dedupe key.' }
  }

  const parts = key.split(':')
  const ticketCode = (parts[0] || '').toUpperCase()
  const eventType = parts[1] || ''

  if (eventType === 'completion_reminder' && ticketCode && ticketCode !== 'NONE') {
    const result = await runCompletionRemindersNow()
    return { ok: result.ok, message: result.message }
  }

  const { error: resetErr } = await supabase
    .from('mail_logs')
    .update({
      status: 'queued',
      error_message: 'Admin retry requested',
    })
    .eq('dedupe_key', key)

  if (resetErr) {
    return { ok: false, message: resetErr.message }
  }

  return {
    ok: true,
    message: `Mail log unlocked (${key}). For completion reminders click Send completion reminders now.`,
  }
}
