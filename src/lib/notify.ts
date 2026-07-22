import { supabase } from './supabase'
import { buildGreenMailTemplate, type MailEvent } from './emailTemplate'
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
      return unique([...user, ...admin])
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

/**
 * App-side mail (Google Apps Script).
 * One ticket + one event = one successful send (dedupe_key).
 * Stuck queued/failed rows are allowed to retry.
 */
export async function notifyTicket(input: NotifyInput): Promise<void> {
  const dedupeKey = buildDedupeKey(input)
  if (inFlight.has(dedupeKey)) return
  inFlight.add(dedupeKey)

  try {
    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('admin_emails, finance_emails, ceo_emails, from_name, mail_webhook_url')
      .eq('id', 1)
      .maybeSingle()

    if (settingsError || !settings) {
      console.warn('Email settings missing. Run patch-email-notifications.sql and set emails in Admin.')
      return
    }

    const webhook = (settings.mail_webhook_url || '').trim()
    if (!webhook) {
      console.warn('mail_webhook_url empty. Paste Google Apps Script Web App URL in Admin → Email alerts.')
      return
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
      return
    }

    // Already sent successfully? Skip.
    const { data: existing } = await supabase
      .from('mail_logs')
      .select('id, status')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle()

    if (existing?.status === 'sent') {
      console.info('Skip duplicate mail (already sent):', dedupeKey)
      return
    }

    // Claim / refresh log row (queued). Do NOT require .select() — that broke User/CEO roles under RLS.
    if (existing) {
      const { error: updErr } = await supabase
        .from('mail_logs')
        .update({
          event_type: input.event,
          ticket_code: input.ticket?.ticket_code ?? null,
          recipients: to.join(', '),
          subject: message.subject,
          status: 'queued',
          error_message: null,
          recipient_count: to.length,
        })
        .eq('dedupe_key', dedupeKey)
        .neq('status', 'sent')
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
          if (again?.status === 'sent') return
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
    let ok = res.ok
    let errMsg: string | null = null
    try {
      const parsed = JSON.parse(text)
      if (parsed.duplicate) {
        ok = true
      } else if (parsed.ok === false) {
        ok = false
        errMsg = String(parsed.error || text).slice(0, 500)
      } else {
        ok = Boolean(parsed.ok) || res.ok
      }
    } catch {
      // Apps Script often returns HTML after redirect; HTTP 200 still means mail may have sent
      ok = res.ok
      if (!ok) errMsg = text.slice(0, 500)
    }

    await markLog(dedupeKey, {
      status: ok ? 'sent' : 'failed',
      error_message: ok ? null : errMsg || text.slice(0, 500),
      recipients: to.join(', '),
      recipient_count: to.length,
    })
  } catch (err) {
    console.warn('Email notify error:', err)
    try {
      await markLog(dedupeKey, {
        status: 'failed',
        error_message: String(err).slice(0, 500),
      })
    } catch {
      // ignore
    }
  } finally {
    inFlight.delete(dedupeKey)
  }
}
