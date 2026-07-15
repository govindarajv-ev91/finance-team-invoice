import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { SearchBox } from '../components/SearchBox'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getPaidTotal, getPendingAmount, getPublicUrl } from '../lib/helpers'
import { notifyTicket } from '../lib/notify'
import { matchesSearch } from '../lib/search'
import type { Ticket } from '../types/database'
import './Dashboard.css'

export function CeoDashboard() {
  const { profile } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [filter, setFilter] = useState<'awaiting_ceo' | 'pending' | 'all'>('awaiting_ceo')
  const [search, setSearch] = useState('')
  const [approveTicket, setApproveTicket] = useState<Ticket | null>(null)
  const [ceoRemark, setCeoRemark] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tickets')
      .select('*, profiles!user_id(*), departments(*)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)

    const { data, error: err } = await query
    if (err) setError(err.message)
    else setError(null)
    setTickets((data as Ticket[]) ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  const filteredTickets = useMemo(
    () =>
      tickets.filter((t) =>
        matchesSearch(
          search,
          t.ticket_code,
          t.subject,
          t.remark,
          t.invoice_number,
          t.bank_name,
          t.account_number,
          t.ifsc_code,
          t.amount,
          t.profiles?.full_name,
          t.departments?.name,
        ),
      ),
    [tickets, search],
  )

  async function onApprove(e: FormEvent) {
    e.preventDefault()
    if (!approveTicket) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('tickets')
      .update({
        status: 'pending',
        ceo_approved_by: profile?.id ?? null,
        ceo_approved_by_name: profile?.full_name ?? 'CEO',
        ceo_approved_at: new Date().toISOString(),
        ceo_remark: ceoRemark.trim() || null,
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
    })
    setApproveTicket(null)
    setCeoRemark('')
    await loadTickets()
  }

  async function onReject(ticket: Ticket) {
    const remark = window.prompt('Rejection remark (optional)') ?? ''
    setError(null)
    const { error: err } = await supabase
      .from('tickets')
      .update({
        status: 'rejected',
        ceo_approved_by: profile?.id ?? null,
        ceo_approved_by_name: profile?.full_name ?? 'CEO',
        ceo_approved_at: new Date().toISOString(),
        ceo_remark: remark.trim() || 'Rejected by CEO',
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
    })
    await loadTickets()
  }

  return (
    <Layout title="CEO — Ticket approval">
      {(error || info) && (
        <p className={error ? 'form-error' : 'form-success'}>{error || info}</p>
      )}
      <div className="toolbar">
        <div className="filter-tabs">
          {(['awaiting_ceo', 'pending', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'awaiting_ceo' ? 'Awaiting approval' : f === 'pending' ? 'Approved' : 'All'}
            </button>
          ))}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Search ticket, invoice, bank…" />
      </div>

      <section className="card">
        <h2>Invoice tickets</h2>
        <p className="muted">Approve tickets before Finance can pay.</p>
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
                  <th>Remark</th>
                  <th>Invoice #</th>
                  <th>Bank / Account / IFSC</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Bill</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <code>{t.ticket_code}</code>
                      <div className="muted tiny">{t.subject}</div>
                    </td>
                    <td>{t.profiles?.full_name ?? '—'}</td>
                    <td>
                      <span className="muted">{t.remark ?? '—'}</span>
                    </td>
                    <td>{t.invoice_number ?? '—'}</td>
                    <td>
                      <div className="cell-stack">
                        <span>{t.bank_name ?? '—'}</span>
                        <span className="muted tiny">{t.account_number ?? '—'}</span>
                        <span className="muted tiny">{t.ifsc_code ?? '—'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>Total {formatCurrency(Number(t.amount))}</strong>
                        <span className="muted tiny">Paid {formatCurrency(getPaidTotal(t))}</span>
                        {getPendingAmount(t) > 0 && (
                          <span className="pending-amt">Pending {formatCurrency(getPendingAmount(t))}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      <a href={getPublicUrl(t.bill_path)} target="_blank" rel="noreferrer">
                        View
                      </a>
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
                        <span className="muted tiny">{formatDate(t.ceo_approved_at)}</span>
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
              Approve ticket <strong>{approveTicket.ticket_code}</strong> (
              {formatCurrency(Number(approveTicket.amount))}) for Finance payment?
            </p>
            <div className="info-grid">
              <div>
                <span>Subject</span>
                <strong>{approveTicket.subject}</strong>
              </div>
              <div>
                <span>User remark</span>
                <strong>{approveTicket.remark ?? '—'}</strong>
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
