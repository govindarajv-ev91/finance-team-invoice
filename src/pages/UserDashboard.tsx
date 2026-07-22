import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { SearchBox } from '../components/SearchBox'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  canRequestRemaining,
  computeDueAt,
  computePayableAmount,
  formatCurrency,
  formatDateTime,
  FULL_PAYABLE_PERCENT,
  generateTicketCode,
  getErrorMessage,
  getInvoiceRemaining,
  getPaidTotal,
  getPayableTarget,
  getPendingAmount,
  getPublicUrl,
  isInvoiceFullyPaid,
  isValidPayablePercent,
  priorityLabel,
  ticketDayCountLabel,
  uploadFile,
} from '../lib/helpers'
import { notifyTicket } from '../lib/notify'
import { DEFAULT_CREATED_DATE_FILTER, matchesCreatedDateFilter } from '../lib/dateRange'
import { matchesSearch } from '../lib/search'
import type { Department, Profile, Ticket, TicketPriority, TicketStatus } from '../types/database'
import './Dashboard.css'

/**
 * True when the ticket creator is that department's own Team Head
 * (matched by role + department, or by the configured Team Head email).
 * Their tickets skip the Team Head queue and go directly to the CEO,
 * so nobody has to approve their own request.
 */
function isOwnTeamHead(
  department: Department | null | undefined,
  profile: Profile | null | undefined,
): boolean {
  if (!department || !profile) return false
  if (profile.role === 'team_head' && profile.department_id === department.id) return true
  const headEmails = (department.team_head_emails ?? '')
    .toLowerCase()
    .split(/[,;\s]+/)
    .filter(Boolean)
  return headEmails.includes((profile.email ?? '').trim().toLowerCase())
}

type MyTicketFilter = 'all' | 'in_progress' | 'partial' | 'paid' | 'completed'

export function UserDashboard() {
  const { user, profile } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [createdDateFilter, setCreatedDateFilter] = useState(DEFAULT_CREATED_DATE_FILTER)
  const [ticketFilter, setTicketFilter] = useState<MyTicketFilter>('all')

  const [departmentId, setDepartmentId] = useState('')
  const [subject, setSubject] = useState('')
  const [purpose, setPurpose] = useState('')
  const [remark, setRemark] = useState('')
  const [amount, setAmount] = useState('')
  const [payablePercent, setPayablePercent] = useState('50')
  const [payFullAmount, setPayFullAmount] = useState(false)
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [billFile, setBillFile] = useState<File | null>(null)
  const [chequeBookFile, setChequeBookFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [requestingId, setRequestingId] = useState<string | null>(null)

  const [ticketPopup, setTicketPopup] = useState<string | null>(null)
  const [completeTicket, setCompleteTicket] = useState<Ticket | null>(null)
  const [completionRemark, setCompletionRemark] = useState('')
  const [completionFile, setCompletionFile] = useState<File | null>(null)
  const [completing, setCompleting] = useState(false)

  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [deptRes, ticketRes] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase
        .from('tickets')
        .select('*, departments(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ])
    if (deptRes.error) setError(deptRes.error.message)
    if (ticketRes.error) setError(ticketRes.error.message)
    setDepartments(deptRes.data ?? [])
    setTickets((ticketRes.data as Ticket[]) ?? [])
    const myDept = profile?.department_id || deptRes.data?.[0]?.id || ''
    setDepartmentId(myDept)
    setLoading(false)
  }, [user, profile?.department_id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const invoiceAmt = Number(amount) || 0
  const pctNum = payFullAmount ? FULL_PAYABLE_PERCENT : Number(payablePercent)
  const approvalPreview =
    invoiceAmt > 0 && isValidPayablePercent(pctNum)
      ? computePayableAmount(invoiceAmt, pctNum)
      : null

  const paidPending = useMemo(
    () => tickets.filter((t) => t.status === 'paid' && isInvoiceFullyPaid(t)),
    [tickets],
  )

  const remainingActions = useMemo(
    () => tickets.filter((t) => canRequestRemaining(t)),
    [tickets],
  )

  const filteredTickets = useMemo(() => {
    let list = tickets
    switch (ticketFilter) {
      case 'in_progress':
        list = tickets.filter((t) =>
          ['awaiting_team_head', 'awaiting_ceo', 'pending', 'rejected'].includes(t.status),
        )
        break
      case 'partial':
        list = tickets.filter((t) => t.status === 'partial')
        break
      case 'paid':
        list = tickets.filter((t) => t.status === 'paid')
        break
      case 'completed':
        list = tickets.filter((t) => t.status === 'completed')
        break
      default:
        break
    }
    return list.filter(
      (t) =>
        matchesCreatedDateFilter(t.created_at, createdDateFilter) &&
        matchesSearch(
          search,
          t.ticket_code,
          t.subject,
          t.purpose,
          t.remark,
          t.amount,
          t.status,
          t.priority,
          t.invoice_number,
          t.bank_name,
          t.account_number,
          t.ifsc_code,
          t.departments?.name,
          t.paid_by_name,
          t.utr_number,
        ),
    )
  }, [tickets, search, ticketFilter, createdDateFilter])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!user || !billFile) {
      setError('Invoice attachment is mandatory.')
      return
    }
    if (!chequeBookFile) {
      setError('Cheque attachment is mandatory.')
      return
    }
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('Enter a valid invoice amount.')
      return
    }
    const percent = payFullAmount ? FULL_PAYABLE_PERCENT : Number(payablePercent)
    if (!isValidPayablePercent(percent)) {
      setError(
        payFullAmount
          ? 'Could not calculate full invoice amount.'
          : 'Payable % must be between 20 and 60, or select Pay full invoice amount.',
      )
      return
    }
    if (!purpose.trim()) {
      setError('Purpose is mandatory.')
      return
    }
    if (!invoiceNumber.trim() || !bankName.trim() || !accountNumber.trim() || !ifscCode.trim()) {
      setError('Invoice number, bank name, account number and IFSC code are mandatory.')
      return
    }
    if (!remark.trim()) {
      setError('Remark is mandatory.')
      return
    }
    if (!departmentId) {
      setError('Your account has no department. Ask Admin to assign one.')
      return
    }
    setSaving(true)
    try {
      const ticketCode = await generateTicketCode()
      const createdAt = new Date().toISOString()
      const payableAmount = computePayableAmount(amt, percent)
      const dueAt = computeDueAt(createdAt, priority)
      const selectedDepartment = departments.find((department) => department.id === departmentId)
      const selfTeamHead = isOwnTeamHead(selectedDepartment, profile)
      const initialStatus: TicketStatus =
        selectedDepartment?.requires_team_head_approval && !selfTeamHead
          ? 'awaiting_team_head'
          : 'awaiting_ceo'
      const initialHistory = selfTeamHead
        ? `${createdAt} | Created by department Team Head — sent directly to CEO | ${profile?.full_name ?? 'Team Head'} | `
        : null
      const uploaded = await uploadFile(billFile, `bills/${user.id}`)
      const chequeUploaded = await uploadFile(chequeBookFile, `user-cheques/${user.id}`)
      const { error: insertError } = await supabase.from('tickets').insert({
        ticket_code: ticketCode,
        user_id: user.id,
        department_id: departmentId,
        subject: subject.trim(),
        purpose: purpose.trim(),
        remark: remark.trim(),
        amount: amt,
        payable_percent: percent,
        payable_amount: payableAmount,
        priority,
        due_at: dueAt,
        invoice_number: invoiceNumber.trim(),
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        ifsc_code: ifscCode.trim().toUpperCase(),
        bill_path: uploaded.path,
        bill_name: uploaded.name,
        user_cheque_path: chequeUploaded.path,
        user_cheque_name: chequeUploaded.name,
        status: initialStatus,
        urgent: false,
        approval_history: initialHistory,
        created_at: createdAt,
      })
      if (insertError) throw insertError
      setTicketPopup(ticketCode)
      void notifyTicket({
        event: 'ticket_created',
        ticket: {
          ticket_code: ticketCode,
          subject: subject.trim(),
          purpose: purpose.trim(),
          remark: remark.trim(),
          amount: amt,
          payable_percent: percent,
          payable_amount: payableAmount,
          priority,
          due_at: dueAt,
          status: initialStatus,
          created_at: createdAt,
          departments: selectedDepartment,
          profiles: { email: profile?.email, full_name: profile?.full_name },
        } as Ticket,
        userEmail: profile?.email,
        userName: profile?.full_name,
      })
      setSubject('')
      setPurpose('')
      setRemark('')
      setAmount('')
      setPayablePercent('50')
      setPayFullAmount(false)
      setPriority('medium')
      setInvoiceNumber('')
      setBankName('')
      setAccountNumber('')
      setIfscCode('')
      setBillFile(null)
      setChequeBookFile(null)
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save ticket'))
    } finally {
      setSaving(false)
    }
  }

  async function onRequestRemaining(ticket: Ticket) {
    setError(null)
    setInfo(null)
    setRequestingId(ticket.id)
    const now = new Date().toISOString()
    try {
      const requiresTeamHead =
        ticket.departments?.requires_team_head_approval === true &&
        !isOwnTeamHead(ticket.departments, profile)
      const nextStatus: TicketStatus = requiresTeamHead
        ? 'awaiting_team_head'
        : 'awaiting_ceo'
      const requestLine = `${now} | Remaining ${formatCurrency(getInvoiceRemaining(ticket))} requested (URGENT) | ${profile?.full_name ?? 'User'} | `
      const approvalHistory = ticket.approval_history
        ? `${ticket.approval_history}\n${requestLine}`
        : requestLine
      const { error: err } = await supabase
        .from('tickets')
        .update({
          status: nextStatus,
          urgent: true,
          remaining_requested_at: now,
          payable_amount: Number(ticket.amount),
          team_head_approved_by: null,
          team_head_approved_by_name: null,
          team_head_approved_at: null,
          team_head_remark: null,
          approval_history: approvalHistory,
        })
        .eq('id', ticket.id)
        .in('status', ['partial', 'paid'])
      if (err) throw err
      const updated = {
        ...ticket,
        status: nextStatus,
        urgent: true,
        remaining_requested_at: now,
        payable_amount: Number(ticket.amount),
      }
      void notifyTicket({
        event: 'remaining_requested',
        ticket: updated,
        userEmail: profile?.email,
        userName: profile?.full_name,
        extra: `Invoice remaining: ${formatCurrency(getInvoiceRemaining(ticket))}. Advance already paid: ${formatCurrency(getPaidTotal(ticket))}.`,
        dedupeSuffix: now,
      })
      setInfo(
        `Urgent remaining-pay request sent for ${ticket.ticket_code}. ${
          requiresTeamHead ? 'Your Team Head must approve it before the CEO.' : 'It is waiting for CEO approval.'
        }`,
      )
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to request remaining payment'))
    } finally {
      setRequestingId(null)
    }
  }

  async function onComplete(e: FormEvent) {
    e.preventDefault()
    if (!completeTicket || !completionFile) {
      setError('Completion attachment is required.')
      return
    }
    if (!completionRemark.trim()) {
      setError('Completion remark is mandatory.')
      return
    }
    setCompleting(true)
    setError(null)
    try {
      const uploaded = await uploadFile(completionFile, `completions/${user?.id}`)
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          status: 'completed',
          completion_remark: completionRemark.trim(),
          completion_path: uploaded.path,
          completion_name: uploaded.name,
          completed_at: new Date().toISOString(),
        })
        .eq('id', completeTicket.id)
      if (updateError) throw updateError
      void notifyTicket({
        event: 'ticket_completed',
        ticket: {
          ...completeTicket,
          status: 'completed',
          completion_remark: completionRemark.trim(),
          profiles: {
            email: profile?.email,
            full_name: profile?.full_name,
          },
        } as Ticket,
        userEmail: profile?.email,
        userName: profile?.full_name,
        extra: completionRemark.trim(),
      })
      setCompleteTicket(null)
      setCompletionRemark('')
      setCompletionFile(null)
      await loadData()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to complete ticket'))
    } finally {
      setCompleting(false)
    }
  }

  const sidebar = (
    <div className="sidebar-section">
      <h3>Awaiting your action</h3>
      {remainingActions.length > 0 && (
        <>
          <p className="muted">Advance paid — request remaining amount (urgent).</p>
          <ul className="sidebar-list">
            {remainingActions.map((t) => (
              <li key={`rem-${t.id}`}>
                <div>
                  <strong>{t.ticket_code}</strong>
                  <span>Left {formatCurrency(getInvoiceRemaining(t))}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={requestingId === t.id}
                  onClick={() => void onRequestRemaining(t)}
                >
                  {requestingId === t.id ? 'Sending…' : 'Pay remaining'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted" style={{ marginTop: remainingActions.length ? '1rem' : 0 }}>
        Fully paid invoices — mark Process Complete to close.
      </p>
      {paidPending.length === 0 && <p className="empty-hint">No paid tickets waiting.</p>}
      <ul className="sidebar-list">
        {paidPending.map((t) => (
          <li key={t.id}>
            <div>
              <strong>{t.ticket_code}</strong>
              <span>{formatCurrency(Number(t.amount))}</span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setCompleteTicket(t)}
            >
              Process Complete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <Layout title={`Welcome, ${profile?.full_name?.split(' ')[0] ?? 'User'}`} sidebar={sidebar}>
      {(error || info) && (
        <p className={error ? 'form-error' : 'form-success'}>{error || info}</p>
      )}
      <section className="card">
        <h2>New invoice request</h2>
        <p className="muted">
          Choose <strong>advance % (20–60)</strong> or tick <strong>Pay full invoice amount</strong> when
          the entire bill must be paid in one go. Finance pays only after approvals.
        </p>
        <form className="form-grid" onSubmit={onCreate}>
          <label>
            Department
            <input
              type="text"
              readOnly
              value={
                profile?.departments?.name ||
                departments.find((d) => d.id === departmentId)?.name ||
                'Not assigned'
              }
            />
          </label>
          <label>
            Subject name
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Vendor payment — March"
            />
          </label>
          <label>
            Invoice number <span className="req">*</span>
            <input
              required
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-001"
            />
          </label>
          <label>
            Invoice attachment <span className="req">*</span>
            <input
              required
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Cheque attachment <span className="req">*</span>
            <input
              required
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setChequeBookFile(e.target.files?.[0] ?? null)}
            />
            <span className="muted tiny">Cancelled cheque / cheque book leaf for bank verification</span>
          </label>
          <label>
            Invoice Amount (₹) <span className="req">*</span>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={payFullAmount}
              onChange={(e) => setPayFullAmount(e.target.checked)}
            />
            <span>
              <strong>Pay full invoice amount (100%)</strong>
              <span className="muted tiny block">
                Use when the entire invoice must be paid now — not a partial advance.
              </span>
            </span>
          </label>
          {!payFullAmount ? (
            <label>
              Payable % (20–60) <span className="req">*</span>
              <input
                required
                type="number"
                min={20}
                max={60}
                step="1"
                value={payablePercent}
                onChange={(e) => setPayablePercent(e.target.value)}
              />
              <span className="muted tiny">
                {approvalPreview != null
                  ? `Approval / pay now: ${formatCurrency(approvalPreview)} of ${formatCurrency(invoiceAmt)}`
                  : 'Enter invoice amount and % between 20 and 60'}
              </span>
            </label>
          ) : (
            <label>
              Payable amount
              <input
                readOnly
                value={
                  approvalPreview != null
                    ? `${formatCurrency(approvalPreview)} (100% of invoice)`
                    : 'Enter invoice amount above'
                }
              />
              <span className="muted tiny">
                CEO will approve the full invoice amount in one payment cycle.
              </span>
            </label>
          )}
          <label>
            Priority <span className="req">*</span>
            <select
              required
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            >
              <option value="high">High (same day)</option>
              <option value="medium">Medium (48 hours)</option>
              <option value="low">Low (72 hours)</option>
            </select>
          </label>
          <label>
            Bank name <span className="req">*</span>
            <input
              required
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. HDFC Bank"
            />
          </label>
          <label>
            Account number <span className="req">*</span>
            <input
              required
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Bank account number"
            />
          </label>
          <label>
            IFSC code <span className="req">*</span>
            <input
              required
              value={ifscCode}
              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
            />
          </label>
          <label className="full">
            Purpose <span className="req">*</span>
            <input
              required
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Why this payment is needed…"
            />
          </label>
          <label className="full">
            Remark <span className="req">*</span>
            <textarea
              required
              rows={3}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Extra notes for CEO / Finance…"
            />
          </label>
          <div className="full">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save ticket'}
            </button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginTop: '1.25rem' }}>
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>My tickets</h2>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search ticket, purpose, invoice…"
          />
        </div>
        <DateRangeFilter value={createdDateFilter} onChange={setCreatedDateFilter} />
        <div className="filter-tabs" style={{ margin: '0.75rem 0' }}>
          {(
            [
              ['all', 'All'],
              ['in_progress', 'In progress'],
              ['partial', 'Partial'],
              ['paid', 'Paid'],
              ['completed', 'Completed'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip ${ticketFilter === id ? 'active' : ''}`}
              onClick={() => setTicketFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="empty-hint">No tickets yet. Create your first invoice above.</p>
        ) : filteredTickets.length === 0 ? (
          <p className="empty-hint">No tickets match this filter / search.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Purpose / Invoice</th>
                  <th>Amount</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Days</th>
                  <th>Files</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <code>{t.ticket_code}</code>
                      <div className="muted tiny">{t.subject}</div>
                      {t.urgent && <span className="urgent-badge">URGENT</span>}
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span>{t.purpose ?? '—'}</span>
                        <span className="muted tiny">{t.invoice_number ?? '—'}</span>
                        <span className="muted tiny">{t.remark ?? ''}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>Invoice {formatCurrency(Number(t.amount))}</strong>
                        <span className="muted tiny">
                          Payable {formatCurrency(getPayableTarget(t))}
                          {t.payable_percent != null
                            ? t.payable_percent === FULL_PAYABLE_PERCENT
                              ? ' (Full)'
                              : ` (${t.payable_percent}%)`
                            : ''}
                        </span>
                        <span className="muted tiny">Paid {formatCurrency(getPaidTotal(t))}</span>
                        {getPendingAmount(t) > 0 && (
                          <span className="pending-amt">
                            Pending {formatCurrency(getPendingAmount(t))}
                          </span>
                        )}
                        {getInvoiceRemaining(t) > 0 && isFullyPaidCycle(t) && (
                          <span className="muted tiny">
                            Invoice left {formatCurrency(getInvoiceRemaining(t))}
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
                        <StatusBadge status={t.status} />
                        {t.status === 'completed' && t.completed_at && (
                          <span className="muted tiny">{formatDateTime(t.completed_at)}</span>
                        )}
                      </div>
                    </td>
                    <td>{formatDateTime(t.created_at)}</td>
                    <td>{ticketDayCountLabel(t)}</td>
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
                      {canRequestRemaining(t) ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={requestingId === t.id}
                          onClick={() => void onRequestRemaining(t)}
                        >
                          {requestingId === t.id ? 'Sending…' : 'Pay remaining amount'}
                        </button>
                      ) : t.status === 'paid' && isInvoiceFullyPaid(t) ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setCompleteTicket(t)}
                        >
                          Process Complete
                        </button>
                      ) : t.completion_path || t.completion_remark ? (
                        <div className="cell-stack">
                          {t.completion_remark && (
                            <span className="muted tiny">{t.completion_remark}</span>
                          )}
                          {t.completion_path && (
                            <a
                              href={getPublicUrl(t.completion_path)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.completion_name || 'View'}
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="muted tiny">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={!!ticketPopup} title="Ticket created" onClose={() => setTicketPopup(null)}>
        <p className="popup-lead">Your invoice was saved successfully.</p>
        <div className="ticket-id-box">
          <span>Unique Ticket ID</span>
          <strong>{ticketPopup}</strong>
        </div>
        <p className="muted">Please save this ID. Next step: CEO approval, then Finance payment.</p>
        <button type="button" className="btn btn-primary" onClick={() => setTicketPopup(null)}>
          Done
        </button>
      </Modal>

      <Modal
        open={!!completeTicket}
        title="Process Complete"
        onClose={() => setCompleteTicket(null)}
        wide
      >
        {completeTicket && (
          <form className="stack-form" onSubmit={onComplete}>
            <p>
              Close ticket <strong>{completeTicket.ticket_code}</strong> (
              {formatCurrency(Number(completeTicket.amount))}). Paid by{' '}
              <strong>{completeTicket.paid_by_name ?? 'Finance'}</strong>.
            </p>
            <label>
              Completion remark <span className="req">*</span>
              <textarea
                required
                rows={3}
                value={completionRemark}
                onChange={(e) => setCompletionRemark(e.target.value)}
                placeholder="Describe what was completed…"
              />
            </label>
            <label>
              Completion attachment <span className="req">*</span>
              <input
                required
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                onChange={(e) => setCompletionFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => setCompleteTicket(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={completing}>
                {completing ? 'Closing…' : 'Mark completed'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Layout>
  )
}

function isFullyPaidCycle(t: Ticket): boolean {
  return getPendingAmount(t) <= 0
}
