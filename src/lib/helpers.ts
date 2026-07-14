import { supabase } from '../lib/supabase'
import type { Ticket } from '../types/database'

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
    // Fallback if counter table not ready
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

export function formatDate(value: string | null): string {
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

/** Total already paid (cumulative). */
export function getPaidTotal(ticket: Ticket): number {
  return Number(ticket.paid_amount ?? 0)
}

/** Remaining amount still to pay. */
export function getPendingAmount(ticket: Ticket): number {
  const total = Number(ticket.amount ?? 0)
  const paid = getPaidTotal(ticket)
  return Math.max(0, Math.round((total - paid) * 100) / 100)
}

export function isFullyPaid(ticket: Ticket): boolean {
  return getPendingAmount(ticket) <= 0
}
