import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { SearchBox } from '../components/SearchBox'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import {
  formatCurrency,
  formatDateTime,
  getPaidTotal,
  getPayableTarget,
  getPublicUrl,
  priorityLabel,
} from '../lib/helpers'
import { notifyTicket } from '../lib/notify'
import { matchesSearch } from '../lib/search'
import { supabase } from '../lib/supabase'
import type { Ticket } from '../types/database'
import './Dashboard.css'

export function TeamHeadDashboard() {
  const { profile } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
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
        .filter((ticket) =>
          matchesSearch(
            search,
            ticket.ticket_code,
            ticket.subject,
            ticket.purpose,
            ticket.invoice_number,
            ticket.profiles?.full_name,
          ),
        ),
    [tickets, search],
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

  return (
    <Layout title="Team Head — Department approvals">
      {error && <p className="form-error">{error}</p>}
      {info && <p className="form-success">{info}</p>}

      <section className="card">
        <div className="toolbar">
          <div>
            <h2 style={{ margin: 0 }}>{profile?.departments?.name ?? 'Department'} approvals</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Approve department invoices before they go to the CEO.
            </p>
          </div>
          <div className="btn-row">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search ticket, user, purpose…"
            />
            <Link to="/dashboard" className="btn btn-primary btn-sm">
              New invoice request
            </Link>
          </div>
        </div>
        <p className="muted tiny">
          Your own invoice requests skip this queue and go directly to the CEO.
        </p>

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
