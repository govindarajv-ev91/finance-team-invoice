import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type NotifyPayload = {
  event:
    | 'ticket_created'
    | 'ceo_approved'
    | 'ceo_rejected'
    | 'payment_made'
    | 'ticket_completed'
    | 'user_approved'
  ticket_code?: string
  subject?: string
  amount?: number | string
  paid_amount?: number | string
  pending_amount?: number | string
  remark?: string
  status?: string
  user_email?: string
  user_name?: string
  extra?: string
}

function splitEmails(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
}

function unique(emails: string[]): string[] {
  return [...new Set(emails)]
}

function buildMessage(payload: NotifyPayload): { subject: string; html: string; text: string } {
  const code = payload.ticket_code || 'N/A'
  const user = payload.user_name || payload.user_email || 'User'
  const brand = 'VoicEV91 Finance Invoice'

  const map: Record<string, { subject: string; body: string }> = {
    ticket_created: {
      subject: `[${brand}] New ticket ${code} created`,
      body: `A new invoice ticket was created by ${user}.\n\nTicket: ${code}\nSubject: ${payload.subject || '—'}\nAmount: ${payload.amount ?? '—'}\nRemark: ${payload.remark || '—'}\nStatus: Awaiting CEO approval`,
    },
    ceo_approved: {
      subject: `[${brand}] Ticket ${code} approved by CEO`,
      body: `CEO approved ticket ${code}. Finance can now pay.\n\nUser: ${user}\nSubject: ${payload.subject || '—'}\nAmount: ${payload.amount ?? '—'}\nRemark: ${payload.remark || '—'}`,
    },
    ceo_rejected: {
      subject: `[${brand}] Ticket ${code} rejected by CEO`,
      body: `CEO rejected ticket ${code}.\n\nUser: ${user}\nSubject: ${payload.subject || '—'}\nRemark: ${payload.remark || '—'}\n${payload.extra || ''}`,
    },
    payment_made: {
      subject: `[${brand}] Payment update for ticket ${code}`,
      body: `A payment was recorded for ticket ${code}.\n\nUser: ${user}\nTotal: ${payload.amount ?? '—'}\nPaid so far: ${payload.paid_amount ?? '—'}\nPending: ${payload.pending_amount ?? '—'}\nStatus: ${payload.status || '—'}\n${payload.extra || ''}`,
    },
    ticket_completed: {
      subject: `[${brand}] Ticket ${code} completed`,
      body: `User marked ticket ${code} as Process Complete.\n\nUser: ${user}\nAmount: ${payload.amount ?? '—'}\nRemark: ${payload.remark || '—'}`,
    },
    user_approved: {
      subject: `[${brand}] Account approved`,
      body: `Your VoicEV91 account has been approved by Admin. You can now sign in and create invoice tickets.\n\nUser: ${user}\nEmail: ${payload.user_email || '—'}`,
    },
  }

  const item = map[payload.event] || {
    subject: `[${brand}] Notification`,
    body: payload.extra || 'Notification from VoicEV91',
  }

  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1a4d2e">
    <h2 style="margin:0 0 12px">${brand}</h2>
    <p style="white-space:pre-wrap">${item.body.replace(/\n/g, '<br/>')}</p>
    <p style="color:#5a7a64;font-size:12px;margin-top:24px">This is an automatic mail from VoicEV91 Finance Invoice Process.</p>
  </div>`

  return { subject: item.subject, html, text: item.body }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = (await req.json()) as NotifyPayload
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('MAIL_FROM') || 'VoicEV91 <onboarding@resend.dev>'

    const adminClient = createClient(supabaseUrl, serviceKey)

    const { data: settings } = await adminClient
      .from('notification_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    const adminEmails = splitEmails(settings?.admin_emails)
    const financeEmails = splitEmails(settings?.finance_emails)
    const ceoEmails = splitEmails(settings?.ceo_emails)
    const userEmail = splitEmails(payload.user_email)

    let recipients: string[] = []
    switch (payload.event) {
      case 'ticket_created':
        recipients = [...userEmail, ...adminEmails, ...ceoEmails, ...financeEmails]
        break
      case 'ceo_approved':
        recipients = [...userEmail, ...adminEmails, ...financeEmails, ...ceoEmails]
        break
      case 'ceo_rejected':
        recipients = [...userEmail, ...adminEmails, ...ceoEmails]
        break
      case 'payment_made':
        recipients = [...userEmail, ...adminEmails, ...financeEmails, ...ceoEmails]
        break
      case 'ticket_completed':
        recipients = [...userEmail, ...adminEmails, ...financeEmails, ...ceoEmails]
        break
      case 'user_approved':
        recipients = [...userEmail, ...adminEmails]
        break
      default:
        recipients = [...userEmail, ...adminEmails]
    }

    recipients = unique(recipients)
    const message = buildMessage(payload)

    if (recipients.length === 0) {
      await adminClient.from('mail_logs').insert({
        event_type: payload.event,
        ticket_code: payload.ticket_code ?? null,
        recipients: '(none)',
        subject: message.subject,
        status: 'skipped',
        error_message: 'No recipients configured',
      })
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_recipients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!resendKey) {
      await adminClient.from('mail_logs').insert({
        event_type: payload.event,
        ticket_code: payload.ticket_code ?? null,
        recipients: recipients.join(', '),
        subject: message.subject,
        status: 'failed',
        error_message: 'RESEND_API_KEY not set in Edge Function secrets',
      })
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'RESEND_API_KEY missing. Set it in Supabase Edge Function secrets.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    })

    const resendBody = await resendRes.json()
    if (!resendRes.ok) {
      await adminClient.from('mail_logs').insert({
        event_type: payload.event,
        ticket_code: payload.ticket_code ?? null,
        recipients: recipients.join(', '),
        subject: message.subject,
        status: 'failed',
        error_message: JSON.stringify(resendBody),
      })
      return new Response(JSON.stringify({ ok: false, error: resendBody }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await adminClient.from('mail_logs').insert({
      event_type: payload.event,
      ticket_code: payload.ticket_code ?? null,
      recipients: recipients.join(', '),
      subject: message.subject,
      status: 'sent',
    })

    return new Response(JSON.stringify({ ok: true, recipients, id: resendBody.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
