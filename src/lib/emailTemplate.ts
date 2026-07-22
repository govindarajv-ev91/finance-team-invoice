import {
  formatCurrency,
  formatDateTime,
  getPaidTotal,
  getPendingAmount,
  getPayableTarget,
  getInvoiceRemaining,
  priorityLabel,
} from './helpers'
import type { Ticket } from '../types/database'

export type MailEvent =
  | 'ticket_created'
  | 'team_head_approved'
  | 'team_head_rejected'
  | 'ceo_approved'
  | 'ceo_rejected'
  | 'payment_made'
  | 'ticket_completed'
  | 'user_approved'
  | 'remaining_requested'
  | 'completion_reminder'

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function appBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_APP_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return 'https://finance-team-invoice.vercel.app'
}

type StatusTone = 'warn' | 'ok' | 'bad' | 'info'

function statusBadge(label: string, tone: StatusTone): string {
  const styles: Record<StatusTone, string> = {
    warn: 'background:#fee2e2;color:#b91c1c;',
    ok: 'background:#dcfce7;color:#15803d;',
    bad: 'background:#fee2e2;color:#b91c1c;',
    info: 'background:#dbeafe;color:#1d4ed8;',
  }
  return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;${styles[tone]}">${esc(label)}</span>`
}

function detailRow(
  icon: string,
  label: string,
  valueHtml: string,
  opts?: { highlight?: boolean; last?: boolean },
): string {
  const bg = opts?.highlight ? 'background:#ecfdf3;' : 'background:transparent;'
  const border = opts?.last ? 'border-bottom:none;' : 'border-bottom:1px solid #d4ead9;'
  return `<tr>
  <td style="padding:12px 14px;${bg}${border}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td width="28" valign="top" style="font-size:16px;line-height:1.4;">${icon}</td>
        <td valign="top">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#2f6b45;margin-bottom:2px;">${esc(label)}</div>
          <div style="font-size:15px;color:#154028;line-height:1.4;">${valueHtml}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`
}

interface TemplateInput {
  event: MailEvent
  ticket?: Ticket | null
  userName?: string | null
  userEmail?: string | null
  extra?: string
}

interface BuiltMail {
  subject: string
  text: string
  html: string
}

/** Green HTML mail template (attached-style card), matching VoicEV91 brand. */
export function buildGreenMailTemplate(input: TemplateInput): BuiltMail {
  const brand = 'VoicEV91 Finance Invoice'
  const ticket = input.ticket
  const code = ticket?.ticket_code || 'N/A'
  const user = input.userName || ticket?.profiles?.full_name || input.userEmail || 'User'
  const appUrl = appBaseUrl()
  const ctaUrl = appUrl
  const payableTarget = ticket ? getPayableTarget(ticket) : 0
  const pct = ticket?.payable_percent != null ? Number(ticket.payable_percent) : null

  const eventMeta: Record<
    MailEvent,
    { subject: string; headline: string; intro: string; statusLabel: string; statusTone: StatusTone }
  > = {
    ticket_created: {
      subject: `[${brand}] New ticket ${code} created`,
      headline: 'A new invoice ticket has been created',
      intro: `A new invoice ticket was created by <strong style="color:#1d4ed8;">${esc(user)}</strong>.`,
      statusLabel:
        ticket?.status === 'awaiting_team_head'
          ? 'Awaiting Team Head Approval'
          : 'Awaiting CEO Approval',
      statusTone: 'warn',
    },
    team_head_approved: {
      subject: `[${brand}] Ticket ${code} approved by Team Head`,
      headline: 'Department Team Head approved the ticket',
      intro: `The Team Head approved ticket <strong>${esc(code)}</strong>. It now needs CEO approval.`,
      statusLabel: 'Awaiting CEO Approval',
      statusTone: 'warn',
    },
    team_head_rejected: {
      subject: `[${brand}] Ticket ${code} rejected by Team Head`,
      headline: 'Ticket rejected by Department Team Head',
      intro: `The Team Head rejected ticket <strong>${esc(code)}</strong>.`,
      statusLabel: 'Rejected',
      statusTone: 'bad',
    },
    ceo_approved: {
      subject: `[${brand}] Ticket ${code} approved by CEO`,
      headline: 'Ticket approved by CEO',
      intro: `CEO approved ticket <strong>${esc(code)}</strong>. Finance can now pay.`,
      statusLabel: 'Pending Payment',
      statusTone: 'info',
    },
    ceo_rejected: {
      subject: `[${brand}] Ticket ${code} rejected by CEO`,
      headline: 'Ticket rejected by CEO',
      intro: `CEO rejected ticket <strong>${esc(code)}</strong>.`,
      statusLabel: 'Rejected',
      statusTone: 'bad',
    },
    payment_made: {
      subject: `[${brand}] Payment update for ticket ${code}`,
      headline: 'Payment recorded',
      intro: `A payment was recorded for ticket <strong>${esc(code)}</strong>.`,
      statusLabel:
        ticket?.status === 'partial'
          ? 'Partial Payment'
          : ticket?.status === 'paid'
            ? 'Paid'
            : String(ticket?.status || 'Payment update'),
      statusTone: ticket?.status === 'partial' ? 'info' : 'ok',
    },
    ticket_completed: {
      subject: `[${brand}] Ticket ${code} completed`,
      headline: 'Process complete',
      intro: `User marked ticket <strong>${esc(code)}</strong> as Process Complete.`,
      statusLabel: 'Completed',
      statusTone: 'ok',
    },
    user_approved: {
      subject: `[${brand}] Account approved`,
      headline: 'Your account is approved',
      intro: `Your VoicEV91 account for <strong style="color:#1d4ed8;">${esc(user)}</strong> has been approved by Admin.`,
      statusLabel: 'Approved',
      statusTone: 'ok',
    },
    remaining_requested: {
      subject: `[URGENT] [${brand}] Remaining payment requested — ${code}`,
      headline: 'URGENT: Remaining amount requested',
      intro: `<strong style="color:#b91c1c;">Urgent</strong> — <strong>${esc(user)}</strong> requested payment of the remaining invoice balance for ticket <strong>${esc(code)}</strong>. Approval is needed before Finance can pay.`,
      statusLabel:
        ticket?.status === 'awaiting_team_head'
          ? 'URGENT — Awaiting Team Head'
          : 'URGENT — Awaiting CEO',
      statusTone: 'warn',
    },
    completion_reminder: {
      subject: `[${brand}] Reminder — complete ticket ${code}`,
      headline: 'Reminder: mark ticket as Process Complete',
      intro: `Ticket <strong>${esc(code)}</strong> has been <strong>fully paid</strong> but is still open. Please log in and click <strong>Process Complete</strong> to close it.`,
      statusLabel: 'Paid — Awaiting Complete',
      statusTone: 'warn',
    },
  }

  const meta = eventMeta[input.event]

  const rows: string[] = []
  if (input.event !== 'user_approved') {
    rows.push(detailRow('🎫', 'Ticket', `<strong>${esc(code)}</strong>`))
    if (ticket?.subject) {
      rows.push(detailRow('📌', 'Subject', esc(ticket.subject)))
    }
    if (ticket?.purpose) {
      rows.push(detailRow('🎯', 'Purpose', esc(ticket.purpose)))
    }
    if (ticket?.amount != null) {
      rows.push(
        detailRow(
          '💰',
          'Invoice Amount',
          `<strong style="color:#15803d;font-size:16px;">${esc(formatCurrency(Number(ticket.amount)))}</strong>`,
          { highlight: true },
        ),
      )
    }
    if (pct != null) {
      rows.push(
        detailRow(
          '📊',
          'Payable %',
          `${esc(pct)}% → Approval / pay now: <strong>${esc(formatCurrency(payableTarget))}</strong>`,
        ),
      )
    } else if (ticket && payableTarget > 0) {
      rows.push(detailRow('📊', 'Payable now', esc(formatCurrency(payableTarget))))
    }
    if (ticket?.priority) {
      rows.push(
        detailRow(
          '⚡',
          'Priority',
          `${esc(priorityLabel(ticket.priority))}${ticket.due_at ? ` · Due ${esc(formatDateTime(ticket.due_at))}` : ''}`,
        ),
      )
    }
    if (input.event === 'payment_made' && ticket) {
      rows.push(
        detailRow(
          '✅',
          'Paid so far',
          `<strong style="color:#15803d;">${esc(formatCurrency(getPaidTotal(ticket)))}</strong>`,
        ),
      )
      rows.push(detailRow('⏳', 'Pending (cycle)', esc(formatCurrency(getPendingAmount(ticket)))))
    }
    if (input.event === 'remaining_requested' && ticket) {
      rows.push(
        detailRow('✅', 'Advance paid', esc(formatCurrency(getPaidTotal(ticket)))),
      )
      rows.push(
        detailRow(
          '🚨',
          'Remaining to approve',
          `<strong style="color:#b91c1c;">${esc(formatCurrency(getInvoiceRemaining(ticket)))}</strong>`,
          { highlight: true },
        ),
      )
    }
    if (input.event === 'completion_reminder' && ticket) {
      rows.push(
        detailRow(
          '✅',
          'Paid amount',
          `<strong style="color:#15803d;">${esc(formatCurrency(getPaidTotal(ticket)))}</strong>`,
        ),
      )
      if (ticket.paid_at) {
        rows.push(detailRow('📅', 'Paid on', esc(formatDateTime(ticket.paid_at))))
      }
      rows.push(
        detailRow(
          '👉',
          'Action needed',
          'Open the app → <strong>My tickets</strong> → click <strong>Process Complete</strong> and upload completion proof.',
          { highlight: true },
        ),
      )
    }
    if (ticket?.remark) {
      rows.push(detailRow('📝', 'Remark', esc(ticket.remark)))
    }
    if (input.extra) {
      rows.push(detailRow('ℹ️', 'Note', esc(input.extra)))
    }
    if (ticket?.created_at) {
      rows.push(detailRow('📅', 'Created', esc(formatDateTime(ticket.created_at))))
    }
    rows.push(
      detailRow('⌛', 'Status', statusBadge(meta.statusLabel, meta.statusTone), { last: true }),
    )
  } else {
    rows.push(detailRow('👤', 'User', esc(user)))
    rows.push(detailRow('✉️', 'Email', esc(input.userEmail || '—')))
    rows.push(
      detailRow('⌛', 'Status', statusBadge(meta.statusLabel, meta.statusTone), { last: true }),
    )
  }

  const textLines = [
    meta.headline,
    '',
    meta.intro.replace(/<[^>]+>/g, ''),
    '',
    input.event !== 'user_approved'
      ? [
          `Ticket: ${code}`,
          ticket?.subject ? `Subject: ${ticket.subject}` : '',
          ticket?.purpose ? `Purpose: ${ticket.purpose}` : '',
          ticket?.amount != null ? `Invoice Amount: ${formatCurrency(Number(ticket.amount))}` : '',
          pct != null ? `Payable %: ${pct}% → ${formatCurrency(payableTarget)}` : '',
          ticket?.priority ? `Priority: ${priorityLabel(ticket.priority)}` : '',
          ticket?.due_at ? `Due: ${formatDateTime(ticket.due_at)}` : '',
          ticket?.remark ? `Remark: ${ticket.remark}` : '',
          `Status: ${meta.statusLabel}`,
          input.extra || '',
        ]
          .filter(Boolean)
          .join('\n')
      : `User: ${user}\nEmail: ${input.userEmail || '—'}\nStatus: ${meta.statusLabel}`,
    '',
    `Open app: ${ctaUrl}`,
  ]

  const headerBg =
    input.event === 'remaining_requested'
      ? 'background:linear-gradient(135deg,#b91c1c,#dc2626);'
      : input.event === 'completion_reminder'
        ? 'background:linear-gradient(135deg,#b45309,#d97706);'
        : 'background:linear-gradient(135deg,#1f6b3a,#15803d);'

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(meta.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef5f0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f0;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d4ead9;box-shadow:0 8px 24px rgba(26,77,46,0.08);">
          <tr>
            <td style="${headerBg}padding:28px 28px 24px;">
              <div style="display:inline-block;background:rgba(255,255,255,0.95);color:#1f6b3a;font-size:11px;font-weight:800;letter-spacing:0.06em;padding:5px 12px;border-radius:999px;margin-bottom:14px;">${input.event === 'remaining_requested' ? 'URGENT' : 'FINANCE INVOICE'}</div>
              <div style="font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;margin:0 0 8px;">${esc(brand)}</div>
              <div style="font-size:15px;color:rgba(255,255,255,0.92);line-height:1.4;">${esc(meta.headline)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;color:#1a4d2e;font-size:15px;line-height:1.55;">
              <p style="margin:0 0 18px;">${meta.intro}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4fbf6;border:1px solid #cfe8d7;border-radius:12px;overflow:hidden;">
                ${rows.join('\n')}
              </table>
              <div style="text-align:center;padding:26px 0 10px;">
                <a href="${esc(ctaUrl)}" style="display:inline-block;background:#1f6b3a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">View Ticket Details</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;text-align:center;font-size:12px;color:#6a8874;line-height:1.5;">
              This is an automated notification from <strong style="color:#2f5a40;">VoicEV91 Finance System</strong>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return {
    subject: meta.subject,
    text: textLines.filter((x) => x !== undefined).join('\n'),
    html,
  }
}
