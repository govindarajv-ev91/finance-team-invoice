import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { SearchBox } from '../components/SearchBox'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { StatusBadge } from '../components/StatusBadge'
import {
  StatusOverview,
  ticketMatchesStatusFilter,
  type StatusFilter,
} from '../components/StatusOverview'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  daysBetween,
  formatCurrency,
  formatDateTime,
  getInvoiceRemaining,
  getPaidTotal,
  getPayableTarget,
  getPendingAmount,
  getPublicUrl,
  priorityLabel,
  ticketDayCountLabel,
} from '../lib/helpers'
import { notifyTicket } from '../lib/notify'
import { DEFAULT_CREATED_DATE_FILTER, matchesCreatedDateFilter } from '../lib/dateRange'
import { matchesSearch } from '../lib/search'
import type { Ticket } from '../types/database'
import './Dashboard.css'

export function CeoDashboard() {
  const { profile } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('awaiting_ceo')
  const [search, setSearch] = useState('')
  const [createdDateFilter, setCreatedDateFilter] = useState(DEFAULT_CREATED_DATE_FILTER)
  const [approveTicket, setApproveTicket] = useState<Ticket | null>(null)
  const [ceoRemark, setCeoRemark] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('tickets')
      .select('*, profiles!user_id(*), departments(*)')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setError(null)
    setTickets((data as Ticket[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  const filteredTickets = useMemo(
    () =>
      tickets
        .filter((t) => ticketMatchesStatusFilter(t, filter))
        .filter(
          (t) =>
            matchesCreatedDateFilter(t.created_at, createdDateFilter) &&
            matchesSearch(
              search,
              t.ticket_code,
              t.subject,
              t.purpose,
              t.remark,
              t.invoice_number,
              t.bank_name,
              t.account_number,
              t.ifsc_code,
              t.amount,
              t.priority,
              t.profiles?.full_name,
              t.departments?.name,
            ),
        ),
    [tickets, search, filter, createdDateFilter],
  )

  async function onApprove(e: FormEvent) {
    e.preventDefault()
    if (!approveTicket) return
    setSaving(true)
    setError(null)
    const nowIso = new Date().toISOString()
    const action = approveTicket.remaining_requested_at
      ? `Approved REMAINING ${formatCurrency(getPayableTarget(approveTicket))}`
      : `Approved advance ${formatCurrency(getPayableTarget(approveTicket))}`
    const historyLine = `${nowIso} | ${action} | ${profile?.full_name ?? 'CEO'} | ${ceoRemark.trim() || ''}`
    const approvalHistory = approveTicket.approval_history
      ? `${approveTicket.approval_history}\n${historyLine}`
      : historyLine
    const { error: err } = await supabase
      .from('tickets')
      .update({
        status: 'pending',
        ceo_approved_by: profile?.id ?? null,
        ceo_approved_by_name: profile?.full_name ?? 'CEO',
        ceo_approved_at: nowIso,
        ceo_remark: ceoRemark.trim() || null,
        approval_history: approvalHistory,
      })
      .eq('id', approveTicket.id)

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setInfo(`Ticket ${approveTicket.ticket_code} approved. Finance can now pay.`)
    void notifyTicket({
      event: 'ceo_approved',
      ticket: { ...approveTicket, status: 'pending' },
      userEmail: approveTicket.profiles?.email,
      userName: approveTicket.profiles?.full_name,
      extra: ceoRemark.trim() || undefined,
      dedupeSuffix: nowIso,
    })
    setApproveTicket(null)
    setCeoRemark('')
    await loadTickets()
  }

  async function onReject(ticket: Ticket) {
    const remark = window.prompt('Rejection remark (optional)') ?? ''
    setError(null)
    const nowIso = new Date().toISOString()
    const rejectLine = `${nowIso} | Rejected${ticket.remaining_requested_at ? ' (remaining request)' : ''} | ${profile?.full_name ?? 'CEO'} | ${remark.trim() || 'Rejected by CEO'}`
    const approvalHistory = ticket.approval_history
      ? `${ticket.approval_history}\n${rejectLine}`
      : rejectLine
    const { error: err } = await supabase
      .from('tickets')
      .update({
        status: 'rejected',
        ceo_approved_by: profile?.id ?? null,
        ceo_approved_by_name: profile?.full_name ?? 'CEO',
        ceo_approved_at: nowIso,
        ceo_remark: remark.trim() || 'Rejected by CEO',
        approval_history: approvalHistory,
      })
      .eq('id', ticket.id)
    if (err) {
      setError(err.message)
      return
    }
    setInfo(`Ticket ${ticket.ticket_code} rejected.`)
    void notifyTicket({
      event: 'ceo_rejected',
      ticket: { ...ticket, status: 'rejected' },
      userEmail: ticket.profiles?.email,
      userName: ticket.profiles?.full_name,
      extra: remark.trim() || 'Rejected by CEO',
      dedupeSuffix: nowIso,
    })
    await loadTickets()
  }

  return (
    <Layout title="CEO — Ticket approval">
      {(error || info) && (
        <p className={error ? 'form-error' : 'form-success'}>{error || info}</p>
      )}

      <StatusOverview
        tickets={tickets}
        activeFilter={filter}
        onFilter={setFilter}
        subtitle="Click a card to filter the list. Approve tickets before Finance can pay."
      />

      <div className="toolbar">
        <div className="filter-tabs">
          {(
            [
              ['awaiting_ceo', 'Awaiting approval'],
              ['pending', 'Approved'],
              ['partial', 'Partial'],
              ['paid', 'Paid'],
              ['completed', 'Completed'],
              ['all', 'All'],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              className={`chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Search ticket, purpose, bank…" />
      </div>

      <DateRangeFilter value={createdDateFilter} onChange={setCreatedDateFilter} />

      <section className="card">
        <h2>Invoice tickets</h2>
        <p className="muted">Approve the payable advance (or urgent remaining) before Finance pays.</p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : filteredTickets.length === 0 ? (
          <p className="empty-hint">No tickets in this list.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>User</th>
                  <th>Purpose / Remark</th>
                  <th>Payable</th>
                  <th>Priority</th>
                  <th>Created / Days</th>
                  <th>Status</th>
                  <th>Files</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => (
                  <tr key={t.id} className={t.urgent ? 'row-urgent' : undefined}>
                    <td>
                      <code>{t.ticket_code}</code>
                      <div className="muted tiny">{t.subject}</div>
                      {(t.urgent || t.remaining_requested_at) && (
                        <span className="urgent-badge">URGENT</span>
                      )}
                    </td>
                    <td>{t.profiles?.full_name ?? '—'}</td>
                    <td>
                      <div className="cell-stack">
                        <span>{t.purpose ?? '—'}</span>
                        <span className="muted tiny">{t.remark ?? ''}</span>
                        {t.team_head_approved_by_name && (
                          <span className="muted tiny">
                            Team Head: {t.team_head_approved_by_name}
                            {t.team_head_remark ? ` · ${t.team_head_remark}` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>
                          Approve {formatCurrency(getPayableTarget(t))}
                        </strong>
                        <span className="muted tiny">
                          of {formatCurrency(Number(t.amount))}
                          {t.payable_percent != null && !t.remaining_requested_at
                            ? ` · ${t.payable_percent}%`
                            : t.remaining_requested_at
                              ? ' · remaining'
                              : ''}
                        </span>
                        <span className="muted tiny">Paid {formatCurrency(getPaidTotal(t))}</span>
                        {getPendingAmount(t) > 0 && (
                          <span className="pending-amt">
                            Pending {formatCurrency(getPendingAmount(t))}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span className={`priority-badge priority-${t.priority || 'medium'}`}>
                          {priorityLabel(t.priority)}
                        </span>
                        {t.due_at && (
                          <span className="muted tiny">Due {formatDateTime(t.due_at)}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span>{formatDateTime(t.created_at)}</span>
                        <span className="muted tiny">{ticketDayCountLabel(t)}</span>
                        {t.status === 'awaiting_ceo' && (
                          <span className="muted tiny">
                            Waiting {daysBetween(t.created_at)} day(s)
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      <div className="cell-stack">
                        <a href={getPublicUrl(t.bill_path)} target="_blank" rel="noreferrer">
                          Invoice
                        </a>
                        {t.user_cheque_path && (
                          <a href={getPublicUrl(t.user_cheque_path)} target="_blank" rel="noreferrer">
                            Cheque
                          </a>
                        )}
                      </div>
                    </td>
                    <td>
                      {t.status === 'awaiting_ceo' ? (
                        <div className="btn-row" style={{ justifyContent: 'flex-start' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setApproveTicket(t)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => onReject(t)}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="muted tiny">{formatDateTime(t.ceo_approved_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={!!approveTicket} title="CEO approval" onClose={() => setApproveTicket(null)}>
        {approveTicket && (
          <form className="stack-form" onSubmit={onApprove}>
            <p>
              Approve ticket <strong>{approveTicket.ticket_code}</strong> for Finance to pay{' '}
              <strong>{formatCurrency(getPayableTarget(approveTicket))}</strong>
              {approveTicket.urgent ? ' (URGENT remaining)' : ''}?
            </p>
            <div className="info-grid">
              <div>
                <span>Invoice amount</span>
                <strong>{formatCurrency(Number(approveTicket.amount))}</strong>
              </div>
              <div>
                <span>Paid amount</span>
                <strong>{formatCurrency(getPaidTotal(approveTicket))}</strong>
              </div>
              <div>
                <span>Remaining payable</span>
                <strong className="pending-amt">
                  {formatCurrency(getInvoiceRemaining(approveTicket))}
                </strong>
              </div>
              <div>
                <span>Approve for Finance</span>
                <strong>{formatCurrency(getPayableTarget(approveTicket))}</strong>
              </div>
              <div>
                <span>Purpose</span>
                <strong>{approveTicket.purpose ?? '—'}</strong>
              </div>
              <div>
                <span>Priority</span>
                <strong>{priorityLabel(approveTicket.priority)}</strong>
              </div>
              <div>
                <span>Subject</span>
                <strong>{approveTicket.subject}</strong>
              </div>
              <div>
                <span>User remark</span>
                <strong>{approveTicket.remark ?? '—'}</strong>
              </div>
              {approveTicket.team_head_approved_by_name && (
                <div>
                  <span>Team Head approval</span>
                  <strong>{approveTicket.team_head_approved_by_name}</strong>
                  <span className="muted tiny">
                    {formatDateTime(approveTicket.team_head_approved_at)}
                    {approveTicket.team_head_remark
                      ? ` · ${approveTicket.team_head_remark}`
                      : ''}
                  </span>
                </div>
              )}
              <div>
                <span>Invoice number</span>
                <strong>{approveTicket.invoice_number ?? '—'}</strong>
              </div>
            </div>
            <label>
              CEO remark (optional)
              <textarea rows={3} value={ceoRemark} onChange={(e) => setCeoRemark(e.target.value)} />
            </label>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setApproveTicket(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Approve'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
