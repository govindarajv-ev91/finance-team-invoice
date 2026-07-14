import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { SearchBox } from '../components/SearchBox'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  formatCurrency,
  formatDate,
  getPaidTotal,
  getPendingAmount,
  getPublicUrl,
} from '../lib/helpers'
import { matchesSearch } from '../lib/search'
import type { Ticket } from '../types/database'
import './Dashboard.css'

export function FinanceDashboard() {
  const { profile } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [filter, setFilter] = useState<
    'all' | 'pending' | 'partial' | 'paid' | 'completed' | 'awaiting_ceo'
  >('pending')
  const [search, setSearch] = useState('')

  const [payTicket, setPayTicket] = useState<Ticket | null>(null)
  const [payerName, setPayerName] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [utrNumber, setUtrNumber] = useState('')
  const [paying, setPaying] = useState(false)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('tickets')
      .select('*, profiles!user_id(*), departments(*)')
      .order('created_at', { ascending: false })

    if (filter === 'pending') {
      // Show both fully awaiting first pay and partial remaining
      query = query.in('status', ['pending', 'partial'])
    } else if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error: err } = await query
    if (err) setError(err.message)
    setTickets((data as Ticket[]) ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  function openPayModal(ticket: Ticket) {
    setError(null)
    setInfo(null)
    const remaining = getPendingAmount(ticket)
    setPaidAmount(remaining > 0 ? remaining.toFixed(2) : Number(ticket.amount).toFixed(2))
    setPayerName((profile?.full_name || profile?.email?.split('@')[0] || '').trim())
    setUtrNumber('')
    setPayTicket(ticket)
  }

  function closePayModal() {
    setPayTicket(null)
    setPaidAmount('')
    setPayerName('')
    setUtrNumber('')
  }

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
          t.invoice_number,
          t.bank_name,
          t.account_number,
          t.ifsc_code,
          t.departments?.name,
          t.profiles?.full_name,
          t.profiles?.email,
          t.paid_by_name,
          t.utr_number,
          t.bill_name,
        ),
      ),
    [tickets, search],
  )

  async function confirmPay(e: FormEvent) {
    e.preventDefault()
    if (!payTicket) return
    if (!payerName.trim() || !utrNumber.trim()) {
      setError('Name and UTR number are mandatory.')
      return
    }
    const thisPay = Number(paidAmount)
    if (!thisPay || thisPay <= 0) {
      setError('Enter a valid paid amount.')
      return
    }

    const alreadyPaid = getPaidTotal(payTicket)
    const remaining = getPendingAmount(payTicket)
    if (thisPay > remaining + 0.001) {
      setError(
        `Paid amount cannot exceed pending ${formatCurrency(remaining)} (Total ${formatCurrency(Number(payTicket.amount))}, already paid ${formatCurrency(alreadyPaid)}).`,
      )
      return
    }

    const newTotalPaid = Math.round((alreadyPaid + thisPay) * 100) / 100
    const stillPending = Math.round((Number(payTicket.amount) - newTotalPaid) * 100) / 100
    const nextStatus = stillPending > 0 ? 'partial' : 'paid'

    const historyLine = `${new Date().toISOString()} | ${formatCurrency(thisPay)} | ${payerName.trim()} | UTR ${utrNumber.trim()}`
    const paymentHistory = payTicket.payment_history
      ? `${payTicket.payment_history}\n${historyLine}`
      : historyLine

    setPaying(true)
    setError(null)
    const { error: err } = await supabase
      .from('tickets')
      .update({
        status: nextStatus,
        paid_by: profile?.id ?? null,
        paid_by_name: payerName.trim(),
        paid_amount: newTotalPaid,
        last_payment_amount: thisPay,
        utr_number: utrNumber.trim(),
        payment_history: paymentHistory,
        paid_at: new Date().toISOString(),
      })
      .eq('id', payTicket.id)
      .in('status', ['pending', 'partial'])

    setPaying(false)
    if (err) {
      setError(err.message)
      return
    }

    if (nextStatus === 'partial') {
      setInfo(
        `Partial payment saved. Paid ${formatCurrency(newTotalPaid)} of ${formatCurrency(Number(payTicket.amount))}. Pending: ${formatCurrency(stillPending)}.`,
      )
    } else {
      setInfo(`Full payment saved for ${payTicket.ticket_code}.`)
    }
    closePayModal()
    await loadTickets()
  }

  return (
    <Layout title="Finance team — Invoice review">
      <div className="toolbar">
        <div className="filter-tabs">
          {(['pending', 'partial', 'awaiting_ceo', 'paid', 'completed', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'awaiting_ceo'
                ? 'Awaiting CEO'
                : f === 'pending'
                  ? 'To pay'
                  : f === 'partial'
                    ? 'Partial'
                    : f === 'all'
                      ? 'All'
                      : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search ticket, UTR, invoice…"
        />
      </div>

      {(error || info) && (
        <p className={error ? 'form-error' : 'form-success'}>{error || info}</p>
      )}

      <section className="card">
        <h2>Invoice list</h2>
        <p className="muted">
          You can pay full or partial amount. If total is ₹5,000 and you pay ₹4,500, pending ₹500 stays open for next pay.
        </p>
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
                  <th>Remark</th>
                  <th>Invoice / Bank</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Bill</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => {
                  const paid = getPaidTotal(t)
                  const pendingAmt = getPendingAmount(t)
                  return (
                    <tr key={t.id}>
                      <td>
                        <code>{t.ticket_code}</code>
                        <div className="muted tiny">{t.subject}</div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong>{t.profiles?.full_name ?? '—'}</strong>
                          <span className="muted">{t.profiles?.email}</span>
                        </div>
                      </td>
                      <td>
                        <span className="muted">{t.remark ?? '—'}</span>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span>{t.invoice_number ?? '—'}</span>
                          <span className="muted tiny">{t.bank_name}</span>
                          <span className="muted tiny">{t.account_number}</span>
                          <span className="muted tiny">{t.ifsc_code}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong>Total {formatCurrency(Number(t.amount))}</strong>
                          <span className="muted tiny">Paid {formatCurrency(paid)}</span>
                          {pendingAmt > 0 ? (
                            <span className="pending-amt">Pending {formatCurrency(pendingAmt)}</span>
                          ) : (
                            <span className="muted tiny">Pending ₹0</span>
                          )}
                          {t.utr_number && <span className="muted tiny">Last UTR {t.utr_number}</span>}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                        {t.paid_by_name && (
                          <div className="muted tiny">Last paid by {t.paid_by_name}</div>
                        )}
                      </td>
                      <td>
                        <a href={getPublicUrl(t.bill_path)} target="_blank" rel="noreferrer">
                          {t.bill_name || 'View bill'}
                        </a>
                      </td>
                      <td>
                        {t.status === 'pending' || t.status === 'partial' ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => openPayModal(t)}
                          >
                            {t.status === 'partial' ? 'Pay remaining' : 'Pay'}
                          </button>
                        ) : t.status === 'awaiting_ceo' ? (
                          <span className="muted tiny">Waiting CEO</span>
                        ) : t.status === 'paid' ? (
                          <span className="muted tiny">Awaiting user complete</span>
                        ) : (
                          <span className="muted tiny">{formatDate(t.completed_at)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={!!payTicket} title="Confirm payment" onClose={closePayModal} wide>
        {payTicket && (
          <form className="stack-form" onSubmit={confirmPay}>
            <p className="popup-lead">
              Payment for ticket <strong>{payTicket.ticket_code}</strong>
            </p>
            <div className="info-grid">
              <div>
                <span>Total amount</span>
                <strong>{formatCurrency(Number(payTicket.amount))}</strong>
              </div>
              <div>
                <span>Already paid</span>
                <strong>{formatCurrency(getPaidTotal(payTicket))}</strong>
              </div>
              <div>
                <span>Pending now</span>
                <strong className="pending-amt">{formatCurrency(getPendingAmount(payTicket))}</strong>
              </div>
              <div>
                <span>User</span>
                <strong>{payTicket.profiles?.full_name}</strong>
              </div>
            </div>
            <label>
              Paying now (₹) <span className="req">*</span>
              <input
                required
                type="number"
                min="0.01"
                max={getPendingAmount(payTicket)}
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
              <span className="muted tiny">
                Auto-filled with pending amount. You can enter less for partial pay (e.g. 4500 of 5000).
              </span>
            </label>
            <label>
              Name (who paid) <span className="req">*</span>
              <input
                required
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="Finance team member name"
              />
            </label>
            <label>
              UTR number <span className="req">*</span>
              <input
                required
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                placeholder="Bank UTR / reference number"
                autoFocus
              />
            </label>
            <p className="muted">
              If you pay less than total, status becomes <strong>Partially Paid</strong> and pending
              balance stays open. Full pay → user can Process Complete.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={closePayModal}>
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
