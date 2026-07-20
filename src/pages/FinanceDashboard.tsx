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
  formatCurrency,
  formatDateTime,
  getErrorMessage,
  getInvoiceRemaining,
  getPaidTotal,
  getPayableTarget,
  getPendingAmount,
  getPublicUrl,
  getUtrNumbers,
  priorityLabel,
  ticketDayCountLabel,
} from '../lib/helpers'
import { notifyTicket } from '../lib/notify'
import { DEFAULT_CREATED_DATE_FILTER, matchesCreatedDateFilter } from '../lib/dateRange'
import { matchesSearch } from '../lib/search'
import type { Ticket } from '../types/database'
import './Dashboard.css'

function todayLocalDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Convert YYYY-MM-DD to ISO at local noon (stable date+time stamp). */
function paymentDateToIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return new Date().toISOString()
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString()
}

export function FinanceDashboard() {
  const { profile } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [createdDateFilter, setCreatedDateFilter] = useState(DEFAULT_CREATED_DATE_FILTER)

  const [payTicket, setPayTicket] = useState<Ticket | null>(null)
  const [payerName, setPayerName] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [utrNumber, setUtrNumber] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayLocalDate())
  const [paying, setPaying] = useState(false)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('tickets')
      .select('*, profiles!user_id(*), departments(*)')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    setTickets((data as Ticket[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  function openPayModal(ticket: Ticket) {
    setError(null)
    setInfo(null)
    const remaining = getPendingAmount(ticket)
    setPaidAmount(remaining > 0 ? remaining.toFixed(2) : Number(getPayableTarget(ticket)).toFixed(2))
    setPayerName((profile?.full_name || profile?.email?.split('@')[0] || '').trim())
    setUtrNumber('')
    setPaymentDate(todayLocalDate())
    setPayTicket(ticket)
  }

  function closePayModal() {
    setPayTicket(null)
    setPaidAmount('')
    setPayerName('')
    setUtrNumber('')
    setPaymentDate(todayLocalDate())
  }

  const filteredTickets = useMemo(() => {
    let list = tickets.filter((t) => {
      if (filter === 'pending') {
        return t.status === 'pending' || t.status === 'partial'
      }
      return ticketMatchesStatusFilter(t, filter)
    })
    return list.filter(
      (t) =>
        matchesCreatedDateFilter(t.created_at, createdDateFilter) &&
        matchesSearch(
          search,
          t.ticket_code,
          t.subject,
          t.purpose,
          t.remark,
          t.ceo_remark,
          t.amount,
          t.status,
          t.priority,
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
          t.cheque_name,
        ),
    )
  }, [tickets, search, filter, createdDateFilter])

  async function confirmPay(e: FormEvent) {
    e.preventDefault()
    if (!payTicket) return
    if (!payerName.trim() || !utrNumber.trim()) {
      setError('Name and UTR number are mandatory.')
      return
    }
    if (!paymentDate.trim()) {
      setError('Payment date is mandatory.')
      return
    }
    const thisPay = Number(paidAmount)
    if (!thisPay || thisPay <= 0) {
      setError('Enter a valid paid amount.')
      return
    }

    const alreadyPaid = getPaidTotal(payTicket)
    const remaining = getPendingAmount(payTicket)
    const target = getPayableTarget(payTicket)
    if (thisPay > remaining + 0.001) {
      setError(
        `Paid amount cannot exceed pending ${formatCurrency(remaining)} (Payable ${formatCurrency(target)}, already paid ${formatCurrency(alreadyPaid)}).`,
      )
      return
    }

    const newTotalPaid = Math.round((alreadyPaid + thisPay) * 100) / 100
    const stillPending = Math.round((target - newTotalPaid) * 100) / 100
    const invoiceLeft = Math.round((Number(payTicket.amount) - newTotalPaid) * 100) / 100
    // 'paid' only when FULL invoice is settled; advance-only stays 'partial'
    const nextStatus = stillPending > 0 || invoiceLeft > 0 ? 'partial' : 'paid'
    const paidAtIso = paymentDateToIso(paymentDate)

    setPaying(true)
    setError(null)
    try {
      const historyLine = `${paidAtIso} | ${formatCurrency(thisPay)} | ${payerName.trim()} | UTR ${utrNumber.trim()} | Payment date ${paymentDate}`
      const paymentHistory = payTicket.payment_history
        ? `${payTicket.payment_history}\n${historyLine}`
        : historyLine

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
          paid_at: paidAtIso,
        })
        .eq('id', payTicket.id)
        .in('status', ['pending', 'partial'])

      if (err) throw err

      const updatedTicket = {
        ...payTicket,
        status: nextStatus,
        paid_amount: newTotalPaid,
        utr_number: utrNumber.trim(),
        paid_by_name: payerName.trim(),
        paid_at: paidAtIso,
      } as Ticket

      if (stillPending > 0) {
        setInfo(
          `Partial payment saved. Paid ${formatCurrency(newTotalPaid)} of payable ${formatCurrency(target)}. Pending: ${formatCurrency(stillPending)}.`,
        )
      } else if (invoiceLeft > 0) {
        setInfo(
          `Advance ${formatCurrency(target)} fully paid for ${payTicket.ticket_code}. Status stays Partially Paid — invoice balance ${formatCurrency(invoiceLeft)} waits for the user's remaining-pay request and CEO approval.`,
        )
      } else {
        setInfo(`Full invoice paid for ${payTicket.ticket_code}.`)
      }
      void notifyTicket({
        event: 'payment_made',
        ticket: updatedTicket,
        userEmail: payTicket.profiles?.email,
        userName: payTicket.profiles?.full_name,
        extra: `This payment: ${formatCurrency(thisPay)} | UTR: ${utrNumber.trim()} | Payment date: ${paymentDate} | By: ${payerName.trim()}`,
        dedupeSuffix: utrNumber.trim(),
      })
      closePayModal()
      await loadTickets()
    } catch (err) {
      setError(getErrorMessage(err, 'Payment failed'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Layout title="Finance team — Invoice review">
      {(error || info) && (
        <p className={error ? 'form-error' : 'form-success'}>{error || info}</p>
      )}

      <StatusOverview
        tickets={tickets}
        activeFilter={filter === 'pending' ? 'pending' : filter}
        onFilter={(f) => setFilter(f)}
        subtitle="Click a card to filter. Pay the approved payable amount and set the payment date."
      />

      <div className="toolbar">
        <div className="filter-tabs">
          {(
            [
              ['pending', 'To pay'],
              ['partial', 'Partial'],
              ['awaiting_team_head', 'Awaiting Team Head'],
              ['awaiting_ceo', 'Awaiting CEO'],
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
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search ticket, UTR, purpose…"
        />
      </div>

      <DateRangeFilter value={createdDateFilter} onChange={setCreatedDateFilter} />

      <section className="card">
        <h2>Invoice list</h2>
        <p className="muted">
          Pay against the <strong>payable amount</strong> (advance %). Partial pays within that
          cycle stay open. Select the <strong>payment date</strong> when confirming pay.
        </p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="empty-hint">No invoices yet.</p>
        ) : filteredTickets.length === 0 ? (
          <p className="empty-hint">No invoices match “{search}” / this filter.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Created by</th>
                  <th>Purpose</th>
                  <th>Account details</th>
                  <th>Amount</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Payment date</th>
                  <th>Invoice / Files</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => {
                  const paid = getPaidTotal(t)
                  const pendingAmt = getPendingAmount(t)
                  const target = getPayableTarget(t)
                  const invoiceLeft = getInvoiceRemaining(t)
                  const utrs = getUtrNumbers(t)
                  return (
                    <tr key={t.id} className={t.urgent ? 'row-urgent' : undefined}>
                      <td>
                        <code>{t.ticket_code}</code>
                        <div className="muted tiny">{t.subject}</div>
                        {(t.urgent || t.remaining_requested_at) && (
                          <span className="urgent-badge">URGENT</span>
                        )}
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong>{t.profiles?.full_name ?? '—'}</strong>
                          <span className="muted">{t.profiles?.email}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span>{t.purpose ?? '—'}</span>
                          <span className="muted tiny">{t.remark ?? ''}</span>
                          {t.ceo_remark && (
                            <span className="muted tiny">
                              CEO: {t.ceo_remark}
                            </span>
                          )}
                          <span className="muted tiny">{t.invoice_number}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span>{t.bank_name ?? '—'}</span>
                          <span className="muted tiny">{t.account_number ?? '—'}</span>
                          <span className="muted tiny">{t.ifsc_code ?? '—'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong>Invoice {formatCurrency(Number(t.amount))}</strong>
                          <span className="muted tiny">
                            Payable {formatCurrency(target)}
                            {t.payable_percent != null && !t.remaining_requested_at
                              ? ` (${t.payable_percent}%)`
                              : ''}
                          </span>
                          <span className="muted tiny">Paid {formatCurrency(paid)}</span>
                          {pendingAmt > 0 ? (
                            <span className="pending-amt">
                              Still to pay now {formatCurrency(pendingAmt)}
                            </span>
                          ) : invoiceLeft > 0 ? (
                            <span className="muted tiny">
                              Advance done — invoice left {formatCurrency(invoiceLeft)}
                            </span>
                          ) : (
                            <span className="muted tiny">Invoice fully paid</span>
                          )}
                          {utrs.length > 0 && (
                            <span className="muted tiny">
                              UTR{utrs.length > 1 ? 's' : ''}: {utrs.join(', ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span className={`priority-badge priority-${t.priority || 'medium'}`}>
                            {priorityLabel(t.priority)}
                          </span>
                          <span className="muted tiny">{ticketDayCountLabel(t)}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                        {t.paid_by_name && (
                          <div className="muted tiny">Last paid by {t.paid_by_name}</div>
                        )}
                      </td>
                      <td>{formatDateTime(t.paid_at)}</td>
                      <td>
                        <div className="cell-stack">
                          <a href={getPublicUrl(t.bill_path)} target="_blank" rel="noreferrer">
                            Invoice
                          </a>
                          {t.user_cheque_path && (
                            <a
                              href={getPublicUrl(t.user_cheque_path)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              User cheque
                            </a>
                          )}
                        </div>
                      </td>
                      <td>
                        {(t.status === 'pending' || t.status === 'partial') && pendingAmt > 0 ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => openPayModal(t)}
                          >
                            {t.status === 'partial' ? 'Pay remaining' : 'Pay'}
                          </button>
                        ) : t.status === 'partial' && pendingAmt <= 0 ? (
                          <span className="muted tiny">
                            Advance paid — waiting user request + CEO approval for balance
                          </span>
                        ) : t.status === 'awaiting_team_head' ? (
                          <span className="muted tiny">Waiting Team Head</span>
                        ) : t.status === 'awaiting_ceo' ? (
                          <span className="muted tiny">Waiting CEO</span>
                        ) : t.status === 'paid' ? (
                          <span className="muted tiny">Awaiting user</span>
                        ) : t.status === 'completed' ? (
                          <div className="cell-stack">
                            {t.completed_at && (
                              <span className="muted tiny">{formatDateTime(t.completed_at)}</span>
                            )}
                            {t.completion_path ? (
                              <a
                                href={getPublicUrl(t.completion_path)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {t.completion_name || 'Completion'}
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <span className="muted tiny">—</span>
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
              {payTicket.urgent ? ' · URGENT' : ''}
            </p>
            <div className="info-grid">
              <div>
                <span>Invoice amount</span>
                <strong>{formatCurrency(Number(payTicket.amount))}</strong>
              </div>
              <div>
                <span>Payable this cycle</span>
                <strong>{formatCurrency(getPayableTarget(payTicket))}</strong>
              </div>
              <div>
                <span>Already paid</span>
                <strong>{formatCurrency(getPaidTotal(payTicket))}</strong>
              </div>
              <div>
                <span>Pending now</span>
                <strong className="pending-amt">
                  {formatCurrency(getPendingAmount(payTicket))}
                </strong>
              </div>
              <div>
                <span>Purpose</span>
                <strong>{payTicket.purpose ?? '—'}</strong>
              </div>
              <div>
                <span>CEO remark</span>
                <strong>{payTicket.ceo_remark ?? '—'}</strong>
              </div>
              <div>
                <span>Previous UTRs</span>
                <strong>
                  {getUtrNumbers(payTicket).length > 0
                    ? getUtrNumbers(payTicket).join(', ')
                    : '—'}
                </strong>
              </div>
              <div>
                <span>User</span>
                <strong>{payTicket.profiles?.full_name}</strong>
              </div>
              <div>
                <span>Invoice number</span>
                <strong>{payTicket.invoice_number ?? '—'}</strong>
              </div>
              <div>
                <span>Bank name</span>
                <strong>{payTicket.bank_name ?? '—'}</strong>
              </div>
              <div>
                <span>Account number</span>
                <strong>{payTicket.account_number ?? '—'}</strong>
              </div>
              <div>
                <span>IFSC code</span>
                <strong>{payTicket.ifsc_code ?? '—'}</strong>
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
                Auto-filled with cycle pending. You can enter less for a partial pay within the
                payable amount.
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
            <label>
              Payment date <span className="req">*</span>
              <input
                required
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
              <span className="muted tiny">Select the bank payment / clearing date.</span>
            </label>
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
