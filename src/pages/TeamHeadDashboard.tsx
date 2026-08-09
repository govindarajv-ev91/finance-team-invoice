import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { SearchBox } from '../components/SearchBox'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import {
  formatCurrency,
  formatDateTime,
  getPaidTotal,
  getPayableTarget,
  getPublicUrl,
  priorityLabel,
  statusLabel,
} from '../lib/helpers'
import { notifyTicket } from '../lib/notify'
import { DEFAULT_CREATED_DATE_FILTER, matchesCreatedDateFilter } from '../lib/dateRange'
import { matchesSearch } from '../lib/search'
import { supabase } from '../lib/supabase'
import type { Ticket } from '../types/database'
import './Dashboard.css'

type TeamHeadTab = 'pending' | 'history'

export function TeamHeadDashboard() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<TeamHeadTab>('pending')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createdDateFilter, setCreatedDateFilter] = useState(DEFAULT_CREATED_DATE_FILTER)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [remark, setRemark] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTickets = useCallback(async () => {
    if (!profile?.department_id) {
      setTickets([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('tickets')
      .select('*, profiles!user_id(*), departments(*)')
      .eq('department_id', profile.department_id)
      .order('created_at', { ascending: false })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setTickets((data as Ticket[]) ?? [])
  }, [profile?.department_id])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  const filtered = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.status === 'awaiting_team_head')
        .filter(
          (ticket) =>
            matchesCreatedDateFilter(ticket.created_at, createdDateFilter) &&
            matchesSearch(
              search,
              ticket.ticket_code,
              ticket.subject,
              ticket.purpose,
              ticket.invoice_number,
              ticket.profiles?.full_name,
            ),
        ),
    [tickets, search, createdDateFilter],
  )

  /** Tickets this department Team Head already reviewed (approve or reject) — read-only history. */
  const approvalHistory = useMemo(
    () =>
      tickets
        .filter((ticket) => !!ticket.team_head_approved_at)
        .filter(
          (ticket) =>
            matchesCreatedDateFilter(ticket.created_at, createdDateFilter) &&
            matchesSearch(
              search,
              ticket.ticket_code,
              ticket.subject,
              ticket.purpose,
              ticket.invoice_number,
              ticket.profiles?.full_name,
              ticket.team_head_remark,
              ticket.status,
            ),
        )
        .sort((a, b) => {
          const aAt = a.team_head_approved_at ? new Date(a.team_head_approved_at).getTime() : 0
          const bAt = b.team_head_approved_at ? new Date(b.team_head_approved_at).getTime() : 0
          return bAt - aAt
        }),
    [tickets, search, createdDateFilter],
  )

  const pendingCount = useMemo(
    () => tickets.filter((t) => t.status === 'awaiting_team_head').length,
    [tickets],
  )

  const historyCount = useMemo(
    () => tickets.filter((t) => !!t.team_head_approved_at).length,
    [tickets],
  )

  async function approve(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    const now = new Date().toISOString()
    const action = selected.remaining_requested_at
      ? `Team Head approved REMAINING ${formatCurrency(getPayableTarget(selected))}`
      : `Team Head approved ${formatCurrency(getPayableTarget(selected))}`
    const line = `${now} | ${action} | ${profile?.full_name ?? 'Team Head'} | ${remark.trim()}`
    const approvalHistory = selected.approval_history
      ? `${selected.approval_history}\n${line}`
      : line

    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('tickets')
      .update({
        status: 'awaiting_ceo',
        team_head_approved_by: profile?.id ?? null,
        team_head_approved_by_name: profile?.full_name ?? 'Team Head',
        team_head_approved_at: now,
        team_head_remark: remark.trim() || null,
        approval_history: approvalHistory,
      })
      .eq('id', selected.id)
      .eq('department_id', profile?.department_id)
      .eq('status', 'awaiting_team_head')
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }

    void notifyTicket({
      event: 'team_head_approved',
      ticket: {
        ...selected,
        status: 'awaiting_ceo',
        team_head_approved_by_name: profile?.full_name ?? 'Team Head',
        team_head_approved_at: now,
        team_head_remark: remark.trim() || null,
      },
      userEmail: selected.profiles?.email,
      userName: selected.profiles?.full_name,
      extra: remark.trim() || undefined,
      dedupeSuffix: now,
    })
    setInfo(`${selected.ticket_code} approved. It is now waiting for CEO approval.`)
    setSelected(null)
    setRemark('')
    await loadTickets()
  }

  async function reject(ticket: Ticket) {
    const rejectionRemark = window.prompt('Rejection remark (mandatory)')?.trim() ?? ''
    if (!rejectionRemark) {
      setError('Rejection remark is mandatory.')
      return
    }
    const now = new Date().toISOString()
    const line = `${now} | Team Head rejected | ${profile?.full_name ?? 'Team Head'} | ${rejectionRemark}`
    const approvalHistory = ticket.approval_history
      ? `${ticket.approval_history}\n${line}`
      : line
    const { error: err } = await supabase
      .from('tickets')
      .update({
        status: 'rejected',
        team_head_approved_by: profile?.id ?? null,
        team_head_approved_by_name: profile?.full_name ?? 'Team Head',
        team_head_approved_at: now,
        team_head_remark: rejectionRemark,
        approval_history: approvalHistory,
      })
      .eq('id', ticket.id)
      .eq('department_id', profile?.department_id)
      .eq('status', 'awaiting_team_head')
    if (err) {
      setError(err.message)
      return
    }
    void notifyTicket({
      event: 'team_head_rejected',
      ticket: {
        ...ticket,
        status: 'rejected',
        team_head_approved_by_name: profile?.full_name ?? 'Team Head',
        team_head_approved_at: now,
        team_head_remark: rejectionRemark,
      },
      userEmail: ticket.profiles?.email,
      userName: ticket.profiles?.full_name,
      extra: rejectionRemark,
      dedupeSuffix: now,
    })
    setInfo(`${ticket.ticket_code} rejected.`)
    await loadTickets()
  }

  const sidebar = (
    <nav className="admin-nav" aria-label="Team Head sections">
      <p className="admin-nav-title">Team Head menu</p>
      <button
        type="button"
        className={`admin-nav-item ${tab === 'pending' ? 'active' : ''}`}
        onClick={() => setTab('pending')}
      >
        <span className="admin-nav-label">Pending approvals</span>
        <span className="admin-nav-hint">
          Waiting for you · {pendingCount}
        </span>
      </button>
      <button
        type="button"
        className={`admin-nav-item ${tab === 'history' ? 'active' : ''}`}
        onClick={() => setTab('history')}
      >
        <span className="admin-nav-label">Team Head Approve History</span>
        <span className="admin-nav-hint">
          Read-only past decisions · {historyCount}
        </span>
      </button>
      <Link to="/dashboard" className="admin-nav-item" style={{ textDecoration: 'none' }}>
        <span className="admin-nav-label">New invoice request</span>
        <span className="admin-nav-hint">Create your own ticket</span>
      </Link>
    </nav>
  )

  return (
    <Layout title="Team Head — Department approvals" sidebar={sidebar}>
      {error && <p className="form-error">{error}</p>}
      {info && <p className="form-success">{info}</p>}

      {tab === 'pending' && (
        <section className="card">
          <div className="toolbar">
            <div>
              <h2 style={{ margin: 0 }}>{profile?.departments?.name ?? 'Department'} approvals</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                Approve department invoices before they go to the CEO.
              </p>
            </div>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search ticket, user, purpose…"
            />
          </div>
          <p className="muted tiny">
            Your own invoice requests skip this queue and go directly to the CEO.
          </p>
          <DateRangeFilter value={createdDateFilter} onChange={setCreatedDateFilter} />

          {loading ? (
            <p className="muted">Loading…</p>
          ) : !profile?.department_id ? (
            <p className="form-error">
              Your Team Head account has no department. Ask Admin to assign one.
            </p>
          ) : filtered.length === 0 ? (
            <p className="empty-hint">No tickets are waiting for your approval.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket / User</th>
                    <th>Purpose</th>
                    <th>Amount</th>
                    <th>Priority</th>
                    <th>Created</th>
                    <th>Files</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ticket) => (
                    <tr key={ticket.id} className={ticket.urgent ? 'row-urgent' : undefined}>
                      <td>
                        <code>{ticket.ticket_code}</code>
                        <div className="muted tiny">{ticket.profiles?.full_name ?? '—'}</div>
                        <div className="muted tiny">{ticket.profiles?.email}</div>
                        {ticket.urgent && <span className="urgent-badge">URGENT</span>}
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong>{ticket.purpose ?? '—'}</strong>
                          <span className="muted tiny">{ticket.subject}</span>
                          <span className="muted tiny">{ticket.remark}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong>Invoice {formatCurrency(Number(ticket.amount))}</strong>
                          <span className="pending-amt">
                            Approve {formatCurrency(getPayableTarget(ticket))}
                          </span>
                          <span className="muted tiny">
                            Paid {formatCurrency(getPaidTotal(ticket))}
                          </span>
                        </div>
                      </td>
                      <td>{priorityLabel(ticket.priority)}</td>
                      <td>{formatDateTime(ticket.created_at)}</td>
                      <td>
                        <a href={getPublicUrl(ticket.bill_path)} target="_blank" rel="noreferrer">
                          Invoice
                        </a>
                      </td>
                      <td>
                        <div className="btn-row">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setSelected(ticket)}
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => void reject(ticket)}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'history' && (
        <section className="card">
          <div className="toolbar">
            <div>
              <h2 style={{ margin: 0 }}>Team Head Approve History</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                Read-only list of tickets already approved or rejected for this department.
              </p>
            </div>
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search history…"
            />
          </div>
          <DateRangeFilter value={createdDateFilter} onChange={setCreatedDateFilter} />

          {loading ? (
            <p className="muted">Loading…</p>
          ) : approvalHistory.length === 0 ? (
            <p className="empty-hint">No approval history yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket / User</th>
                    <th>Decision</th>
                    <th>When</th>
                    <th>Amount</th>
                    <th>Remark</th>
                    <th>Current status</th>
                    <th>Files</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalHistory.map((ticket) => {
                    const wasRejected = /Team Head rejected/i.test(ticket.approval_history ?? '')
                    return (
                      <tr key={`hist-${ticket.id}`}>
                        <td>
                          <code>{ticket.ticket_code}</code>
                          <div className="muted tiny">{ticket.profiles?.full_name ?? '—'}</div>
                          <div className="muted tiny">{ticket.purpose ?? ticket.subject}</div>
                        </td>
                        <td>
                          <strong>{wasRejected ? 'Rejected' : 'Approved'}</strong>
                          <div className="muted tiny">
                            by {ticket.team_head_approved_by_name ?? 'Team Head'}
                          </div>
                        </td>
                        <td>{formatDateTime(ticket.team_head_approved_at)}</td>
                        <td>
                          <div className="cell-stack">
                            <span>Approve {formatCurrency(getPayableTarget(ticket))}</span>
                            <span className="muted tiny">
                              Invoice {formatCurrency(Number(ticket.amount))}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="muted tiny">{ticket.team_head_remark || '—'}</span>
                        </td>
                        <td>
                          <StatusBadge status={ticket.status} />
                          <div className="muted tiny">{statusLabel(ticket.status)}</div>
                        </td>
                        <td>
                          <a href={getPublicUrl(ticket.bill_path)} target="_blank" rel="noreferrer">
                            Invoice
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <Modal
        open={!!selected}
        title="Team Head approval"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <form className="stack-form" onSubmit={approve}>
            <StatusBadge status={selected.status} />
            <div className="info-grid">
              <div>
                <span>Ticket</span>
                <strong>{selected.ticket_code}</strong>
              </div>
              <div>
                <span>User</span>
                <strong>{selected.profiles?.full_name ?? '—'}</strong>
              </div>
              <div>
                <span>Invoice amount</span>
                <strong>{formatCurrency(Number(selected.amount))}</strong>
              </div>
              <div>
                <span>Approve amount</span>
                <strong>{formatCurrency(getPayableTarget(selected))}</strong>
              </div>
              <div>
                <span>Purpose</span>
                <strong>{selected.purpose ?? '—'}</strong>
              </div>
              <div>
                <span>Invoice number</span>
                <strong>{selected.invoice_number ?? '—'}</strong>
              </div>
            </div>
            <label>
              Team Head remark (optional)
              <textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </label>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Approve and send to CEO'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
