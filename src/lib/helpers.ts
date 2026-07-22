import { supabase } from '../lib/supabase'
import type { Ticket, TicketPriority } from '../types/database'

export async function generateTicketCode(): Promise<string> {
  const letters = Array.from({ length: 5 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join('')

  const { data, error } = await supabase
    .from('ticket_counters')
    .select('last_number')
    .eq('id', 1)
    .single()

  if (error) {
    const fallback = String(Math.floor(Math.random() * 900) + 100)
    return `${letters}${fallback}`
  }

  const next = (data?.last_number ?? 0) + 1
  await supabase.from('ticket_counters').update({ last_number: next }).eq('id', 1)

  return `${letters}${String(next).padStart(3, '0')}`
}

export async function uploadFile(file: File, folder: string): Promise<{ path: string; name: string }> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${folder}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from('invoice-files').upload(path, file)
  if (error) throw error
  return { path, name: file.name }
}

/** Readable message from Error, Supabase PostgrestError, or anything else. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: string; error_description?: string; details?: string; hint?: string; code?: string }
    const parts = [e.message || e.error_description, e.details, e.hint].filter(Boolean)
    if (parts.length) return `${parts.join(' — ')}${e.code ? ` (code ${e.code})` : ''}`
  }
  if (typeof err === 'string' && err) return err
  return fallback
}

export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from('invoice-files').getPublicUrl(path)
  return data.publicUrl
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Date only. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Date and time (for action / payment stamps). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function statusLabel(status: Ticket['status']): string {
  switch (status) {
    case 'awaiting_team_head':
      return 'Awaiting Team Head'
    case 'awaiting_ceo':
      return 'Awaiting CEO'
    case 'pending':
      return 'CEO Approved — Pay'
    case 'partial':
      return 'Partially Paid'
    case 'paid':
      return 'Paid — Awaiting Complete'
    case 'completed':
      return 'Completed'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

export function priorityLabel(priority: TicketPriority | string | null | undefined): string {
  switch (priority) {
    case 'high':
      return 'High (same day)'
    case 'medium':
      return 'Medium (48 hours)'
    case 'low':
      return 'Low (72 hours)'
    default:
      return 'Medium (48 hours)'
  }
}

/** Hours to add for SLA due date from created time. */
export function prioritySlaHours(priority: TicketPriority): number {
  switch (priority) {
    case 'high':
      return 0 // same calendar day — due end of day; we use +8h as practical same-day window
    case 'medium':
      return 48
    case 'low':
      return 72
    default:
      return 48
  }
}

export function computeDueAt(createdIso: string, priority: TicketPriority): string {
  const created = new Date(createdIso)
  if (priority === 'high') {
    // Same day: end of that calendar day (local)
    const end = new Date(created)
    end.setHours(23, 59, 59, 999)
    return end.toISOString()
  }
  const ms = prioritySlaHours(priority) * 60 * 60 * 1000
  return new Date(created.getTime() + ms).toISOString()
}

export const FULL_PAYABLE_PERCENT = 100

/** Valid payable % at ticket creation: advance 20–60, or full invoice at 100. */
export function isValidPayablePercent(percent: number): boolean {
  if (!percent || percent <= 0) return false
  if (percent === FULL_PAYABLE_PERCENT) return true
  return percent >= 20 && percent <= 60
}

export function computePayableAmount(invoiceAmount: number, percent: number): number {
  return Math.round(invoiceAmount * (percent / 100) * 100) / 100
}

/** Amount Finance must pay in the current cycle (advance or full after remaining request). */
export function getPayableTarget(ticket: Ticket): number {
  if (ticket.remaining_requested_at) {
    return Number(ticket.amount ?? 0)
  }
  const payable = ticket.payable_amount
  if (payable != null && Number(payable) > 0) return Number(payable)
  return Number(ticket.amount ?? 0)
}

/** Total already paid (cumulative). */
export function getPaidTotal(ticket: Ticket): number {
  return Number(ticket.paid_amount ?? 0)
}

/** Remaining against current payable target (advance or full invoice after remaining request). */
export function getPendingAmount(ticket: Ticket): number {
  const target = getPayableTarget(ticket)
  const paid = getPaidTotal(ticket)
  return Math.max(0, Math.round((target - paid) * 100) / 100)
}

/** Remaining against full invoice amount. */
export function getInvoiceRemaining(ticket: Ticket): number {
  const total = Number(ticket.amount ?? 0)
  const paid = getPaidTotal(ticket)
  return Math.max(0, Math.round((total - paid) * 100) / 100)
}

/** Current payable cycle fully paid. */
export function isFullyPaid(ticket: Ticket): boolean {
  return getPendingAmount(ticket) <= 0
}

/** Full invoice settled — user can Process Complete. */
export function isInvoiceFullyPaid(ticket: Ticket): boolean {
  return getInvoiceRemaining(ticket) <= 0
}

/** All UTR / reference numbers from payment history (and latest utr_number). */
export function getUtrNumbers(ticket: Ticket): string[] {
  const list: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const v = raw.trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    list.push(v)
  }
  const history = ticket.payment_history ?? ''
  const re = /UTR[:\s]+([^\s|]+)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(history)) !== null) add(match[1])
  if (ticket.utr_number) add(ticket.utr_number)
  return list
}

export interface PaymentEntry {
  at: string
  amount: string
  by: string
  utr: string
  paymentDate: string
}

/** Parse payment_history lines: "iso | amount | name | UTR xxx | Payment date yyyy-mm-dd". */
export function getPaymentEntries(ticket: Ticket): PaymentEntry[] {
  const history = ticket.payment_history ?? ''
  return history
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim())
      return {
        at: parts[0] ?? '',
        amount: parts[1] ?? '',
        by: parts[2] ?? '',
        utr: (parts[3] ?? '').replace(/^UTR\s*/i, ''),
        paymentDate: (parts[4] ?? '').replace(/^Payment date\s*/i, ''),
      }
    })
}

export interface ApprovalEntry {
  at: string
  action: string
  by: string
  remark: string
}

/** Parse approval_history lines: "iso | action | name | remark". */
export function getApprovalEntries(ticket: Ticket): ApprovalEntry[] {
  const history = ticket.approval_history ?? ''
  return history
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim())
      return {
        at: parts[0] ?? '',
        action: parts[1] ?? '',
        by: parts[2] ?? '',
        remark: parts[3] ?? '',
      }
    })
}

/** Advance paid, invoice balance left — user can request remaining (urgent). */
export function canRequestRemaining(ticket: Ticket): boolean {
  return (
    (ticket.status === 'partial' || ticket.status === 'paid') &&
    !ticket.remaining_requested_at &&
    isFullyPaid(ticket) &&
    getInvoiceRemaining(ticket) > 0
  )
}

/** Whole days between two timestamps (end defaults to now). */
export function daysBetween(from: string | null | undefined, to?: string | null): number {
  if (!from) return 0
  const start = new Date(from).getTime()
  const end = to ? new Date(to).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  const diff = Math.max(0, end - start)
  return Math.floor(diff / (24 * 60 * 60 * 1000))
}

/** Day count label: created → completed, or running days. */
export function ticketDayCountLabel(ticket: Ticket): string {
  const days = daysBetween(ticket.created_at, ticket.completed_at)
  if (ticket.completed_at) return `${days} day${days === 1 ? '' : 's'} (done)`
  return `${days} day${days === 1 ? '' : 's'} open`
}
