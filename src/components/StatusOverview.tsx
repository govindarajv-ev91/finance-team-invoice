import type { CSSProperties, ReactNode } from 'react'
import { formatCurrency, getPaidTotal, getPendingAmount } from '../lib/helpers'
import type { Ticket, TicketStatus } from '../types/database'

export type StatusFilter =
  | 'all'
  | 'awaiting_team_head'
  | 'awaiting_ceo'
  | 'pending'
  | 'partial'
  | 'paid'
  | 'completed'
  | 'rejected'

interface StatusOverviewProps {
  tickets: Ticket[]
  activeFilter?: StatusFilter
  onFilter?: (filter: StatusFilter) => void
  /** Extra card (e.g. pending users) — Admin only */
  extraCards?: ReactNode
  title?: string
  subtitle?: string
}

function computeStats(tickets: Ticket[]) {
  const awaitingTeamHead = tickets.filter((x) => x.status === 'awaiting_team_head').length
  const awaitingCeo = tickets.filter((x) => x.status === 'awaiting_ceo').length
  const pending = tickets.filter((x) => x.status === 'pending').length
  const partial = tickets.filter((x) => x.status === 'partial').length
  const paid = tickets.filter((x) => x.status === 'paid').length
  const completed = tickets.filter((x) => x.status === 'completed').length
  const rejected = tickets.filter((x) => x.status === 'rejected').length
  const urgent = tickets.filter((x) => x.urgent || x.remaining_requested_at).length
  const paidAmount = tickets.reduce((sum, x) => sum + getPaidTotal(x), 0)
  const pendingAmount = tickets.reduce((sum, x) => sum + getPendingAmount(x), 0)
  return {
    awaitingTeamHead,
    awaitingCeo,
    pending,
    partial,
    paid,
    completed,
    rejected,
    urgent,
    paidAmount,
    pendingAmount,
    total: tickets.length,
  }
}

export function StatusOverview({
  tickets,
  activeFilter,
  onFilter,
  extraCards,
  title = 'Status overview',
  subtitle = 'Quick summary of invoice tickets.',
}: StatusOverviewProps) {
  const stats = computeStats(tickets)
  const clickable = Boolean(onFilter)

  function card(
    filter: StatusFilter | null,
    className: string,
    label: string,
    value: string | number,
    style?: CSSProperties,
  ) {
    const active = filter && activeFilter === filter
    const cls = `stat-card ${className}${clickable && filter ? ' clickable' : ''}${active ? ' active-stat' : ''}`
    if (clickable && filter && onFilter) {
      return (
        <button type="button" className={cls} style={style} onClick={() => onFilter(filter)}>
          <span>{label}</span>
          <strong>{value}</strong>
        </button>
      )
    }
    return (
      <div className={cls} style={style}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    )
  }

  return (
    <section className="card" style={{ marginBottom: '1.25rem' }}>
      <h2>{title}</h2>
      <p className="muted">{subtitle}</p>
      <div className="stats-grid">
        {extraCards}
        {card('awaiting_team_head', '', 'Awaiting Team Head', stats.awaitingTeamHead, {
          background: '#f5f3ff',
          borderColor: '#c4b5fd',
        })}
        {card('awaiting_ceo', '', 'Awaiting CEO', stats.awaitingCeo)}
        {card('pending', 'warn', 'Ready to pay', stats.pending)}
        {card('partial', '', 'Partially Paid', stats.partial, {
          background: '#fff7ed',
          borderColor: '#fdba74',
        })}
        {card('paid', 'info', 'Paid (open)', stats.paid)}
        {card('completed', 'ok', 'Completed', stats.completed)}
        {stats.urgent > 0 &&
          card(null, 'warn', 'Urgent / remaining', stats.urgent, {
            background: '#fef2f2',
            borderColor: '#fca5a5',
          })}
        {card(null, 'ok', 'Paid amount', formatCurrency(stats.paidAmount))}
        {card(null, 'warn', 'Pending balance', formatCurrency(stats.pendingAmount))}
      </div>
    </section>
  )
}

export function ticketMatchesStatusFilter(ticket: Ticket, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  return ticket.status === (filter as TicketStatus)
}
