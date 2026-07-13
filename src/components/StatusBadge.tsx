import type { TicketStatus } from '../types/database'
import { statusLabel } from '../lib/helpers'
import './StatusBadge.css'

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>
}
