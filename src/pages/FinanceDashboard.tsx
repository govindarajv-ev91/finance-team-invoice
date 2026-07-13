import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { SearchBox } from '../components/SearchBox'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getPublicUrl } from '../lib/helpers'
import { matchesSearch } from '../lib/search'
import type { Ticket } from '../types/database'
import './Dashboard.css'

export function FinanceDashboard() {
  const { profile } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'completed'>('pending')
  const [search, setSearch] = useState('')

  const [payTicket, setPayTicket] = useState<Ticket | null>(null)
  const [payerName, setPayerName] = useState('')
  const [paying, setPaying] = useState(false)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tickets')
      .select('*, profiles!user_id(*), departments(*)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)

    const { data, error: err } = await query
    if (err) setError(err.message)
    setTickets((data as Ticket[]) ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  useEffect(() => {
    if (payTicket) setPayerName(profile?.full_name ?? '')
  }, [payTicket, profile?.full_name])

  const filteredTickets = useMemo(
    () =>
      tickets.filter((t) =>
        matchesSearch(
          search,
          t.ticket_code,
          t.subject,
          t.remark,
          t.amount,
          t.status,
          t.departments?.name,
          t.profiles?.full_name,
          t.profiles?.email,
          t.paid_by_name,
          t.bill_name,
        ),
      ),
    [tickets, search],
  )

  async function confirmPay(e: FormEvent) {
    e.preventDefault()
    if (!payTicket || !payerName.trim()) {
      setError('Finance team member name is mandatory.')
      return
    }
    setPaying(true)
    setError(null)
    const { error: err } = await supabase
      .from('tickets')
      .update({
        status: 'paid',
        paid_by: profile?.id ?? null,
        paid_by_name: payerName.trim(),
        paid_at: new Date().toISOString(),
      })
      .eq('id', payTicket.id)

    setPaying(false)
    if (err) {
      setError(err.message)
      return
    }
    setPayTicket(null)
    await loadTickets()
  }

  return (
    <Layout title="Finance team — Invoice review">
      <div className="toolbar">
        <div className="filter-tabs">
          {(['pending', 'paid', 'completed', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search ticket, user, subject…"
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      <section className="card">
        <h2>Invoice list</h2>
        <p className="muted">Review attached bills. Click Pay when the amount has been paid.</p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="empty-hint">No invoices in this filter.</p>
        ) : filteredTickets.length === 0 ? (
          <p className="empty-hint">No invoices match “{search}”.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Created by</th>
                  <th>Department</th>
                  <th>Subject</th>
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
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>{t.profiles?.full_name ?? '—'}</strong>
                        <span className="muted">{t.profiles?.email}</span>
                      </div>
                    </td>
                    <td>{t.departments?.name ?? '—'}</td>
                    <td>
                      <div className="cell-stack">
                        <span>{t.subject}</span>
                        {t.remark && <span className="muted">{t.remark}</span>}
                      </div>
                    </td>
                    <td>{formatCurrency(Number(t.amount))}</td>
                    <td>
                      <StatusBadge status={t.status} />
                      {t.paid_by_name && (
                        <div className="muted tiny">Paid by {t.paid_by_name}</div>
                      )}
                    </td>
                    <td>
                      <a href={getPublicUrl(t.bill_path)} target="_blank" rel="noreferrer">
                        {t.bill_name || 'View bill'}
                      </a>
                    </td>
                    <td>
                      {t.status === 'pending' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setPayTicket(t)}
                        >
                          Pay
                        </button>
                      ) : t.status === 'paid' ? (
                        <span className="muted tiny">Awaiting user complete</span>
                      ) : (
                        <span className="muted tiny">{formatDate(t.completed_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={!!payTicket} title="Confirm payment" onClose={() => setPayTicket(null)}>
        {payTicket && (
          <form className="stack-form" onSubmit={confirmPay}>
            <p className="popup-lead">
              Confirm payment for ticket <strong>{payTicket.ticket_code}</strong>
            </p>
            <div className="info-grid">
              <div>
                <span>User</span>
                <strong>{payTicket.profiles?.full_name}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>{formatCurrency(Number(payTicket.amount))}</strong>
              </div>
            </div>
            <label>
              Finance team member who paid <span className="req">*</span>
              <input
                required
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="Enter finance team name"
              />
            </label>
            <p className="muted">
              After payment, the ticket stays open until the user marks Process Complete.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setPayTicket(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={paying}>
                {paying ? 'Saving…' : 'Confirm Pay'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}
