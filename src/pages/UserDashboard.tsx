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
  generateTicketCode,
  getPaidTotal,
  getPendingAmount,
  getPublicUrl,
  uploadFile,
} from '../lib/helpers'
import { matchesSearch } from '../lib/search'
import type { Department, Ticket } from '../types/database'
import './Dashboard.css'

export function UserDashboard() {
  const { user, profile } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [departmentId, setDepartmentId] = useState('')
  const [subject, setSubject] = useState('')
  const [remark, setRemark] = useState('')
  const [amount, setAmount] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [billFile, setBillFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

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
    // One user = one department (from profile)
    const myDept = profile?.department_id || deptRes.data?.[0]?.id || ''
    setDepartmentId(myDept)
    setLoading(false)
  }, [user, profile?.department_id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const paidPending = useMemo(
    () => tickets.filter((t) => t.status === 'paid'),
    [tickets],
  )

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
          t.paid_by_name,
          t.utr_number,
        ),
      ),
    [tickets, search],
  )

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!user || !billFile) {
      setError('Bill attachment is mandatory.')
      return
    }
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('Enter a valid amount.')
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
      const uploaded = await uploadFile(billFile, `bills/${user.id}`)
      const { error: insertError } = await supabase.from('tickets').insert({
        ticket_code: ticketCode,
        user_id: user.id,
        department_id: departmentId,
        subject: subject.trim(),
        remark: remark.trim(),
        amount: amt,
        invoice_number: invoiceNumber.trim(),
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        ifsc_code: ifscCode.trim().toUpperCase(),
        bill_path: uploaded.path,
        bill_name: uploaded.name,
        status: 'awaiting_ceo',
      })
      if (insertError) throw insertError
      setTicketPopup(ticketCode)
      setSubject('')
      setRemark('')
      setAmount('')
      setInvoiceNumber('')
      setBankName('')
      setAccountNumber('')
      setIfscCode('')
      setBillFile(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ticket')
    } finally {
      setSaving(false)
    }
  }

  async function onComplete(e: FormEvent) {
    e.preventDefault()
    if (!completeTicket || !completionFile) {
      setError('Completion attachment is required.')
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
          completion_remark: completionRemark.trim() || null,
          completion_path: uploaded.path,
          completion_name: uploaded.name,
          completed_at: new Date().toISOString(),
        })
        .eq('id', completeTicket.id)
      if (updateError) throw updateError
      setCompleteTicket(null)
      setCompletionRemark('')
      setCompletionFile(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete ticket')
    } finally {
      setCompleting(false)
    }
  }

  const sidebar = (
    <div className="sidebar-section">
      <h3>Awaiting your action</h3>
      <p className="muted">Paid invoices — mark Process Complete to close.</p>
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
      <section className="card">
        <h2>New invoice request</h2>
        <p className="muted">
          After save, the ticket goes to <strong>CEO approval</strong>. Finance can pay only after CEO approves.
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
            Amount (₹) <span className="req">*</span>
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
          <label>
            Bill attachment <span className="req">*</span>
            <input
              required
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="full">
            Remark <span className="req">*</span>
            <textarea
              required
              rows={3}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Describe the invoice / payment purpose…"
            />
          </label>
          {error && <p className="form-error full">{error}</p>}
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
            placeholder="Search ticket, subject, dept…"
          />
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="empty-hint">No tickets yet. Create your first invoice above.</p>
        ) : filteredTickets.length === 0 ? (
          <p className="empty-hint">No tickets match “{search}”.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Invoice</th>
                  <th>Bank / IFSC</th>
                  <th>Remark</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Bill</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <code>{t.ticket_code}</code>
                      <div className="muted tiny">{t.subject}</div>
                    </td>
                    <td>{t.invoice_number ?? '—'}</td>
                    <td>
                      <div className="cell-stack">
                        <span>{t.bank_name ?? '—'}</span>
                        <span className="muted tiny">{t.account_number}</span>
                        <span className="muted tiny">{t.ifsc_code}</span>
                      </div>
                    </td>
                    <td>
                      <span className="muted">{t.remark ?? '—'}</span>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>{formatCurrency(Number(t.amount))}</strong>
                        <span className="muted tiny">Paid {formatCurrency(getPaidTotal(t))}</span>
                        {getPendingAmount(t) > 0 && (
                          <span className="pending-amt">Pending {formatCurrency(getPendingAmount(t))}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>{formatDate(t.created_at)}</td>
                    <td>
                      <a href={getPublicUrl(t.bill_path)} target="_blank" rel="noreferrer">
                        View
                      </a>
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
              Remarks (optional)
              <textarea
                rows={3}
                value={completionRemark}
                onChange={(e) => setCompletionRemark(e.target.value)}
              />
            </label>
            <label>
              Attachment including remarks <span className="req">*</span>
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
