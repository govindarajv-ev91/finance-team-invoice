import { useMemo } from 'react'
import type { Ticket, TicketStatus } from '../types/database'
import { formatCurrency, priorityLabel, statusLabel, ticketDayCountLabel } from '../lib/helpers'
import './KanbanBoard.css'

/** The ordered list of statuses that become Kanban columns. */
const COLUMN_ORDER: TicketStatus[] = [
  'awaiting_team_head',
  'awaiting_ceo',
  'pending',
  'partial',
  'paid',
  'completed',
  'rejected',
]

interface KanbanBoardProps {
  tickets: Ticket[]
  onSelectTicket: (ticket: Ticket) => void
}

export function KanbanBoard({ tickets, onSelectTicket }: KanbanBoardProps) {
  /** Group tickets by status. */
  const columns = useMemo(() => {
    const groups = new Map<TicketStatus, Ticket[]>()
    for (const status of COLUMN_ORDER) groups.set(status, [])
    for (const t of tickets) {
      const bucket = groups.get(t.status)
      if (bucket) bucket.push(t)
    }
    return COLUMN_ORDER.map((status) => ({
      status,
      label: statusLabel(status),
      tickets: groups.get(status) ?? [],
      totalAmount: (groups.get(status) ?? []).reduce(
        (sum, t) => sum + Number(t.amount),
        0,
      ),
    }))
  }, [tickets])

  return (
    <div className="kanban-board">
      {columns.map((col) => (
        <div
          key={col.status}
          className={`kanban-column kanban-col-${col.status}`}
        >
          {/* ── Column header ── */}
          <div className="kanban-column-header">
            <div className="kanban-column-header-top">
              <span className="kanban-column-title">{col.label}</span>
              <span className="kanban-column-count">{col.tickets.length}</span>
            </div>
            {col.tickets.length > 0 && (
              <span className="kanban-column-amount">
                {formatCurrency(col.totalAmount)}
              </span>
            )}
          </div>

          {/* ── Card list ── */}
          <div className="kanban-card-list">
            {col.tickets.length === 0 ? (
              <div className="kanban-empty">No tickets</div>
            ) : (
              col.tickets.map((t) => (
                <KanbanCard
                  key={t.id}
                  ticket={t}
                  onClick={() => onSelectTicket(t)}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Single card ─────────────────────────────────────── */

function KanbanCard({
  ticket: t,
  onClick,
}: {
  ticket: Ticket
  onClick: () => void
}) {
  const isUrgent = t.urgent || !!t.remaining_requested_at

  return (
    <div
      className={`kanban-card${isUrgent ? ' card-urgent' : ''}`}
      onClick={onClick}
    >
      {/* Top row: code + badges */}
      <div className="kanban-card-top">
        <span className="kanban-card-code">{t.ticket_code}</span>
        <div className="kanban-card-badges">
          {isUrgent && <span className="urgent-badge">URGENT</span>}
          <span
            className={`priority-badge priority-${t.priority || 'medium'}`}
          >
            {priorityLabel(t.priority)}
          </span>
        </div>
      </div>

      {/* User & department */}
      <div className="kanban-card-user">
        {t.profiles?.full_name ?? '—'}
      </div>
      <div className="kanban-card-dept">
        {t.departments?.name ?? '—'}
      </div>

      {/* Subject / purpose */}
      <div className="kanban-card-subject">
        {t.purpose ?? t.subject}
      </div>

      {/* Bottom row: amount + age */}
      <div className="kanban-card-bottom">
        <span className="kanban-card-amount">
          {formatCurrency(Number(t.amount))}
        </span>
        <span className="kanban-card-age">{ticketDayCountLabel(t)}</span>
      </div>
    </div>
  )
}
