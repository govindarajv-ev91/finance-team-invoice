import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { Modal } from '../components/Modal'
import { SearchBox } from '../components/SearchBox'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { downloadExcel } from '../lib/excel'
import { isAllowedEmail } from '../lib/emailDomain'
import { DEFAULT_CREATED_DATE_FILTER, matchesCreatedDateFilter } from '../lib/dateRange'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getApprovalEntries,
  getInvoiceRemaining,
  getPaidTotal,
  getPayableTarget,
  getPaymentEntries,
  getPendingAmount,
  getPublicUrl,
  getUtrNumbers,
  priorityLabel,
  ticketDayCountLabel,
} from '../lib/helpers'
import { notifyTicket } from '../lib/notify'
import { matchesSearch } from '../lib/search'
import type { Department, Profile, Ticket, UserRole } from '../types/database'
import './Dashboard.css'

type AdminTab =
  | 'overview'
  | 'approvals'
  | 'tickets'
  | 'users'
  | 'create-user'
  | 'departments'
  | 'department-approvals'
  | 'emails'
  | 'export'

interface UserCredential {
  user_id: string
  email: string
  password_text: string
  full_name: string
  role: UserRole
}

interface MailLog {
  id: string
  event_type: string
  ticket_code: string | null
  recipients: string
  subject: string
  status: string
  error_message: string | null
  dedupe_key: string | null
  recipient_count: number | null
  created_at: string
}

const NAV: { id: AdminTab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Status summary' },
  { id: 'approvals', label: 'User approvals', hint: 'Approve signups' },
  { id: 'tickets', label: 'Tickets', hint: 'All invoices' },
  { id: 'users', label: 'Users & passwords', hint: 'Accounts list' },
  { id: 'create-user', label: 'Create user', hint: 'Add login' },
  { id: 'departments', label: 'Departments', hint: 'Manage depts' },
  { id: 'department-approvals', label: 'Department approvals', hint: 'Team Head routing' },
  { id: 'emails', label: 'Email alerts', hint: 'Admin/CEO/Finance mails' },
  { id: 'export', label: 'Excel download', hint: 'Export data' },
]

export function AdminDashboard() {
  const { profile, signUp, signIn, signOut } = useAuth()
  const [tab, setTab] = useState<AdminTab>('overview')
  const [departments, setDepartments] = useState<Department[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [credentials, setCredentials] = useState<UserCredential[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [newDept, setNewDept] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    | 'all'
    | 'awaiting_team_head'
    | 'awaiting_ceo'
    | 'pending'
    | 'partial'
    | 'paid'
    | 'completed'
    | 'rejected'
  >('all')
  const [showPasswords, setShowPasswords] = useState(false)
  const [ticketSearch, setTicketSearch] = useState('')
  const [createdDateFilter, setCreatedDateFilter] = useState(DEFAULT_CREATED_DATE_FILTER)
  const [userSearch, setUserSearch] = useState('')
  const [deptSearch, setDeptSearch] = useState('')
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)

  const [adminEmails, setAdminEmails] = useState('')
  const [financeEmails, setFinanceEmails] = useState('')
  const [ceoEmails, setCeoEmails] = useState('')
  const [mailWebhookUrl, setMailWebhookUrl] = useState('')
  const [savingEmails, setSavingEmails] = useState(false)
  const [mailLogs, setMailLogs] = useState<MailLog[]>([])
  const [mailLogSearch, setMailLogSearch] = useState('')

  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('user')
  const [newUserDepartmentId, setNewUserDepartmentId] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)

  const loadAll = useCallback(async () => {
    const [d, u, c, t, s, m] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('profiles').select('*, departments(*)').order('created_at', { ascending: false }),
      supabase.from('user_credentials').select('*').order('created_at', { ascending: false }),
      supabase
        .from('tickets')
        .select('*, profiles!user_id(*), departments(*)')
        .order('created_at', { ascending: false }),
      supabase.from('notification_settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('mail_logs').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    if (d.error || u.error || c.error || t.error) {
      setError(
        d.error?.message ||
          u.error?.message ||
          c.error?.message ||
          t.error?.message ||
          'Load failed',
      )
    } else {
      setError(null)
    }
    setDepartments(d.data ?? [])
    setUsers(u.data ?? [])
    setCredentials((c.data as UserCredential[]) ?? [])
    setTickets((t.data as Ticket[]) ?? [])
    setMailLogs((m.data as MailLog[]) ?? [])
    if (!newUserDepartmentId && d.data?.[0]) setNewUserDepartmentId(d.data[0].id)
    if (s.data) {
      setAdminEmails(s.data.admin_emails ?? '')
      setFinanceEmails(s.data.finance_emails ?? '')
      setCeoEmails(s.data.ceo_emails ?? '')
      setMailWebhookUrl(s.data.mail_webhook_url ?? '')
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const credByUserId = useMemo(() => {
    const map = new Map<string, UserCredential>()
    credentials.forEach((c) => map.set(c.user_id, c))
    return map
  }, [credentials])

  const filteredMailLogs = useMemo(() => {
    const q = mailLogSearch.trim().toLowerCase()
    if (!q) return mailLogs
    return mailLogs.filter((row) =>
      matchesSearch(
        q,
        row.ticket_code,
        row.event_type,
        row.recipients,
        row.subject,
        row.status,
        row.dedupe_key,
      ),
    )
  }, [mailLogs, mailLogSearch])

  const stats = useMemo(() => {
    const awaitingTeamHead = tickets.filter((x) => x.status === 'awaiting_team_head').length
    const awaitingCeo = tickets.filter((x) => x.status === 'awaiting_ceo').length
    const pending = tickets.filter((x) => x.status === 'pending').length
    const partial = tickets.filter((x) => x.status === 'partial').length
    const paid = tickets.filter((x) => x.status === 'paid').length
    const completed = tickets.filter((x) => x.status === 'completed').length
    const totalAmount = tickets.reduce((sum, x) => sum + Number(x.amount), 0)
    const paidAmount = tickets.reduce((sum, x) => sum + getPaidTotal(x), 0)
    const pendingAmount = tickets.reduce((sum, x) => sum + getPendingAmount(x), 0)
    const pendingUsers = users.filter((u) => u.role === 'user' && u.is_approved === false).length
    return {
      awaitingTeamHead,
      awaitingCeo,
      pending,
      partial,
      paid,
      completed,
      total: tickets.length,
      totalAmount,
      paidAmount,
      pendingAmount,
      pendingUsers,
    }
  }, [tickets, users])

  const pendingApprovals = useMemo(
    () => users.filter((u) => u.role === 'user' && u.is_approved === false),
    [users],
  )

  const filteredTickets = useMemo(() => {
    const byStatus = statusFilter === 'all' ? tickets : tickets.filter((t) => t.status === statusFilter)
    return byStatus.filter(
      (t) =>
        matchesCreatedDateFilter(t.created_at, createdDateFilter) &&
        matchesSearch(
          ticketSearch,
          t.ticket_code,
          t.subject,
          t.purpose,
          t.remark,
          t.ceo_remark,
          t.ceo_approved_by_name,
          t.completion_remark,
          t.completion_name,
          t.amount,
          t.status,
          t.priority,
          t.departments?.name,
          t.profiles?.full_name,
          t.profiles?.email,
          t.paid_by_name,
          t.utr_number,
          t.payment_history,
          t.invoice_number,
          t.cheque_name,
          t.bank_name,
          t.account_number,
        ),
    )
  }, [tickets, statusFilter, ticketSearch, createdDateFilter])

  const filteredUsers = useMemo(
    () =>
      users.filter((u) => {
        const cred = credByUserId.get(u.id)
        return matchesSearch(
          userSearch,
          u.full_name,
          u.email,
          u.role,
          u.departments?.name,
          cred?.password_text,
        )
      }),
    [users, userSearch, credByUserId],
  )

  const filteredDepartments = useMemo(
    () => departments.filter((d) => matchesSearch(deptSearch, d.name)),
    [departments, deptSearch],
  )

  const pageTitle = NAV.find((n) => n.id === tab)?.label ?? 'Admin'

  function clearMessages() {
    setError(null)
    setInfo(null)
  }

  function switchTab(next: AdminTab) {
    clearMessages()
    setTab(next)
  }

  async function addDepartment(e: FormEvent) {
    e.preventDefault()
    clearMessages()
    const name = newDept.trim()
    if (!name) return
    const { error: err } = await supabase.from('departments').insert({ name })
    if (err) {
      setError(err.message)
      return
    }
    setNewDept('')
    setInfo(`Department “${name}” added.`)
    await loadAll()
  }

  async function removeDepartment(id: string) {
    clearMessages()
    const { error: err } = await supabase.from('departments').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    await loadAll()
  }

  async function saveDepartmentApproval(department: Department) {
    clearMessages()
    const headEmails = department.team_head_emails
      .split(/[,;\s]+/)
      .map((email) => email.trim())
      .filter(Boolean)
    if (
      department.requires_team_head_approval &&
      (headEmails.length === 0 || headEmails.some((email) => !isAllowedEmail(email)))
    ) {
      setError(
        `Enter at least one valid @ev91riderz.com Team Head email for ${department.name}.`,
      )
      return
    }
    const { error: err } = await supabase
      .from('departments')
      .update({
        requires_team_head_approval: department.requires_team_head_approval,
        team_head_emails: headEmails.join(', '),
      })
      .eq('id', department.id)
    if (err) {
      setError(err.message)
      return
    }
    setInfo(
      `${department.name}: ${
        department.requires_team_head_approval
          ? 'Team Head → CEO approval enabled.'
          : 'Direct CEO approval enabled.'
      }`,
    )
    await loadAll()
  }

  async function updateRole(userId: string, role: UserRole) {
    clearMessages()
    const { error: err } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (err) {
      setError(err.message)
      return
    }
    await supabase
      .from('user_credentials')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    await loadAll()
  }

  async function updateUserDepartment(userId: string, departmentId: string) {
    clearMessages()
    const { error: err } = await supabase
      .from('profiles')
      .update({ department_id: departmentId || null })
      .eq('id', userId)
    if (err) {
      setError(err.message)
      return
    }
    await loadAll()
  }

  async function approveUser(userId: string) {
    clearMessages()
    const target = users.find((u) => u.id === userId)
    const { error: err } = await supabase
      .from('profiles')
      .update({
        is_approved: true,
        approved_at: new Date().toISOString(),
        approved_by: profile?.id ?? null,
      })
      .eq('id', userId)
    if (err) {
      setError(err.message)
      return
    }
    setInfo('User approved. They can now open the invoice dashboard.')
    void notifyTicket({
      event: 'user_approved',
      userEmail: target?.email,
      userName: target?.full_name,
    })
    await loadAll()
  }

  async function saveEmailSettings(e: FormEvent) {
    e.preventDefault()
    clearMessages()
    setSavingEmails(true)
    const { error: err } = await supabase.from('notification_settings').upsert({
      id: 1,
      admin_emails: adminEmails.trim(),
      finance_emails: financeEmails.trim(),
      ceo_emails: ceoEmails.trim(),
      mail_webhook_url: mailWebhookUrl.trim(),
      updated_at: new Date().toISOString(),
    })
    setSavingEmails(false)
    if (err) {
      setError(err.message)
      return
    }
    setInfo('Email alert settings saved.')
  }

  async function savePasswordRecord(userId: string, email: string, fullName: string, role: UserRole) {
    const password = window.prompt(`Enter / update password to show for ${email}`)
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    clearMessages()
    const { error: err } = await supabase.from('user_credentials').upsert({
      user_id: userId,
      email,
      password_text: password,
      full_name: fullName,
      role,
      updated_at: new Date().toISOString(),
    })
    if (err) {
      setError(err.message)
      return
    }
    setInfo(`Password saved for ${email}.`)
    await loadAll()
  }

  async function createUser(e: FormEvent) {
    e.preventDefault()
    clearMessages()

    if (!profile?.email) {
      setError('Admin profile not loaded.')
      return
    }
    if (newUserPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    const adminCred = credentials.find((c) => c.user_id === profile.id)
    const restorePassword = adminPassword || adminCred?.password_text
    if (!restorePassword) {
      setError('Enter your admin password once so we can keep you signed in after creating the user.')
      return
    }

    setCreatingUser(true)
    const { error: createErr } = await signUp(
      newUserEmail.trim(),
      newUserPassword,
      newUserName.trim(),
      newUserRole,
      newUserRole === 'user' || newUserRole === 'team_head'
        ? newUserDepartmentId || null
        : null,
    )

    if (createErr) {
      setCreatingUser(false)
      setError(createErr)
      await signIn(profile.email, restorePassword)
      return
    }

    await signOut()
    const { error: restoreErr } = await signIn(profile.email, restorePassword)
    setCreatingUser(false)

    if (restoreErr) {
      setError(`User created, but could not restore admin login: ${restoreErr}. Sign in again as admin.`)
      return
    }

    await supabase.from('user_credentials').upsert({
      user_id: profile.id,
      email: profile.email,
      password_text: restorePassword,
      full_name: profile.full_name,
      role: 'admin',
      updated_at: new Date().toISOString(),
    })

    // Admin-created accounts are auto-approved
    await supabase
      .from('profiles')
      .update({
        is_approved: true,
        approved_at: new Date().toISOString(),
        approved_by: profile.id,
        role: newUserRole,
        department_id:
          newUserRole === 'user' || newUserRole === 'team_head'
            ? newUserDepartmentId || null
            : null,
      })
      .eq('email', newUserEmail.trim())

    setInfo(`User ${newUserEmail} created and password saved.`)
    setNewUserName('')
    setNewUserEmail('')
    setNewUserPassword('')
    setNewUserRole('user')
    setAdminPassword('')
    await loadAll()
    setTab('users')
  }

  function exportTicketsExcel(
    status:
      | 'all'
      | 'awaiting_team_head'
      | 'awaiting_ceo'
      | 'pending'
      | 'partial'
      | 'paid'
      | 'completed'
      | 'rejected' = 'all',
  ) {
    const list = (status === 'all' ? tickets : tickets.filter((t) => t.status === status)).filter(
      (t) => matchesCreatedDateFilter(t.created_at, createdDateFilter),
    )
    const rows = list.map((t) => ({
      Ticket: t.ticket_code,
      User: t.profiles?.full_name ?? '',
      Email: t.profiles?.email ?? '',
      Department: t.departments?.name ?? '',
      Subject: t.subject,
      Purpose: t.purpose ?? '',
      'Invoice Number': t.invoice_number ?? '',
      'Bank Name': t.bank_name ?? '',
      'Account Number': t.account_number ?? '',
      'IFSC Code': t.ifsc_code ?? '',
      'User remark': t.remark ?? '',
      'CEO remark': t.ceo_remark ?? '',
      'Completion remark': t.completion_remark ?? '',
      'Invoice Amount': Number(t.amount),
      'Payable %': t.payable_percent ?? '',
      'Payable Amount': getPayableTarget(t),
      'Paid Amount': getPaidTotal(t),
      'Pending (cycle)': getPendingAmount(t),
      'Invoice remaining': getInvoiceRemaining(t),
      Priority: priorityLabel(t.priority),
      'Due at': t.due_at ? formatDateTime(t.due_at) : '',
      Urgent: t.urgent ? 'Yes' : 'No',
      Status: t.status,
      Created: formatDateTime(t.created_at),
      'Created by': t.profiles?.full_name ?? '',
      'Team Head Approved by': t.team_head_approved_by_name ?? '',
      'Team Head Approved at': t.team_head_approved_at
        ? formatDateTime(t.team_head_approved_at)
        : '',
      'Team Head remark': t.team_head_remark ?? '',
      'CEO Approved by': t.ceo_approved_by_name ?? '',
      'CEO Approved at': t.ceo_approved_at ? formatDateTime(t.ceo_approved_at) : '',
      'Remaining requested at': t.remaining_requested_at
        ? formatDateTime(t.remaining_requested_at)
        : '',
      'Paid by': t.paid_by_name ?? '',
      'Last payment amount': t.last_payment_amount ?? '',
      UTRs: getUtrNumbers(t).join(', '),
      'Approval history': t.approval_history ?? '',
      'Payment history': t.payment_history ?? '',
      'Paid at': t.paid_at ? formatDateTime(t.paid_at) : '',
      'Completed at': t.completed_at ? formatDateTime(t.completed_at) : '',
      'Day count': ticketDayCountLabel(t),
      'Invoice file': t.bill_name,
      'User cheque file': t.user_cheque_name ?? '',
      'Pay cheque file': t.cheque_name ?? '',
      'Completion file': t.completion_name ?? '',
    }))
    downloadExcel(rows, 'Tickets', `VoicEV91_Tickets_${status}_${Date.now()}.xlsx`)
    setInfo(`Downloaded ${rows.length} ticket row(s) to Excel.`)
  }

  function exportUsersExcel() {
    const rows = users.map((u) => {
      const cred = credByUserId.get(u.id)
      return {
        Name: u.full_name,
        Email: u.email,
        Password: cred?.password_text ?? '',
        Role: u.role,
        Joined: formatDate(u.created_at),
      }
    })
    downloadExcel(rows, 'Users', `VoicEV91_Users_${Date.now()}.xlsx`)
    setInfo(`Downloaded ${rows.length} user row(s) to Excel.`)
  }

  function exportDepartmentsExcel() {
    const rows = departments.map((d) => ({
      Department: d.name,
      'Approval route': d.requires_team_head_approval ? 'Team Head -> CEO' : 'Direct to CEO',
      'Team Head emails': d.team_head_emails,
      Created: formatDate(d.created_at),
    }))
    downloadExcel(rows, 'Departments', `VoicEV91_Departments_${Date.now()}.xlsx`)
    setInfo(`Downloaded ${rows.length} department row(s) to Excel.`)
  }

  function exportAllExcel() {
    exportTicketsExcel('all')
    exportUsersExcel()
    exportDepartmentsExcel()
  }

  const sidebar = (
    <nav className="admin-nav" aria-label="Admin sections">
      <p className="admin-nav-title">Admin menu</p>
      {NAV.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`admin-nav-item ${tab === item.id ? 'active' : ''}`}
          onClick={() => switchTab(item.id)}
        >
          <span className="admin-nav-label">{item.label}</span>
          <span className="admin-nav-hint">{item.hint}</span>
        </button>
      ))}
    </nav>
  )

  return (
    <Layout title={pageTitle} sidebar={sidebar}>
      {(error || info) && (
        <p className={error ? 'form-error' : 'form-success'}>{error || info}</p>
      )}

      {tab === 'overview' && (
        <section className="card">
          <h2>Status overview</h2>
          <p className="muted">Quick summary of approvals and invoice tickets.</p>
          <div className="stats-grid">
            <button type="button" className="stat-card warn clickable" onClick={() => switchTab('approvals')}>
              <span>Users awaiting approval</span>
              <strong>{stats.pendingUsers}</strong>
            </button>
            <button type="button" className="stat-card clickable" onClick={() => { setStatusFilter('awaiting_team_head'); switchTab('tickets') }} style={{ background: '#f5f3ff', borderColor: '#c4b5fd' }}>
              <span>Awaiting Team Head</span>
              <strong>{stats.awaitingTeamHead}</strong>
            </button>
            <button type="button" className="stat-card clickable" onClick={() => { setStatusFilter('awaiting_ceo'); switchTab('tickets') }}>
              <span>Awaiting CEO</span>
              <strong>{stats.awaitingCeo}</strong>
            </button>
            <button type="button" className="stat-card warn clickable" onClick={() => { setStatusFilter('pending'); switchTab('tickets') }}>
              <span>Ready to pay</span>
              <strong>{stats.pending}</strong>
            </button>
            <button type="button" className="stat-card clickable" onClick={() => { setStatusFilter('partial'); switchTab('tickets') }} style={{ background: '#fff7ed', borderColor: '#fdba74' }}>
              <span>Partially Paid</span>
              <strong>{stats.partial}</strong>
            </button>
            <button type="button" className="stat-card info clickable" onClick={() => { setStatusFilter('paid'); switchTab('tickets') }}>
              <span>Paid (open)</span>
              <strong>{stats.paid}</strong>
            </button>
            <button type="button" className="stat-card ok clickable" onClick={() => { setStatusFilter('completed'); switchTab('tickets') }}>
              <span>Completed</span>
              <strong>{stats.completed}</strong>
            </button>
            <div className="stat-card ok">
              <span>Paid amount</span>
              <strong>{formatCurrency(stats.paidAmount)}</strong>
            </div>
            <div className="stat-card warn">
              <span>Pending balance</span>
              <strong>{formatCurrency(stats.pendingAmount)}</strong>
            </div>
          </div>
        </section>
      )}

      {tab === 'approvals' && (
        <section className="card">
          <h2>User signup approvals</h2>
          <p className="muted">Approve new users so they can open the invoice dashboard.</p>
          {pendingApprovals.length === 0 ? (
            <p className="empty-hint">No pending user approvals.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Joined</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>{u.departments?.name ?? '—'}</td>
                      <td>{formatDate(u.created_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => approveUser(u.id)}
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'tickets' && (
        <section className="card">
          <div className="toolbar">
            <div>
              <h2 style={{ margin: 0 }}>Tickets by status</h2>
              <p className="muted" style={{ marginBottom: 0 }}>Filter, search, and download the list.</p>
            </div>
            <div className="btn-row">
              <SearchBox
                value={ticketSearch}
                onChange={setTicketSearch}
                placeholder="Search ticket, user, subject…"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => exportTicketsExcel(statusFilter)}>
                Download Excel
              </button>
            </div>
          </div>
          <DateRangeFilter value={createdDateFilter} onChange={setCreatedDateFilter} />
          <div className="filter-tabs" style={{ margin: '1rem 0' }}>
            {(
              [
                'all',
                'awaiting_team_head',
                'awaiting_ceo',
                'pending',
                'partial',
                'paid',
                'completed',
                'rejected',
              ] as const
            ).map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${statusFilter === f ? 'active' : ''}`}
                onClick={() => setStatusFilter(f)}
              >
                {f === 'all'
                  ? 'All'
                  : f === 'awaiting_team_head'
                    ? 'Awaiting Team Head'
                  : f === 'awaiting_ceo'
                    ? 'Awaiting CEO'
                    : f === 'partial'
                      ? 'Partial'
                      : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>User / Dept</th>
                  <th>Purpose</th>
                  <th>Amounts</th>
                  <th>Status &amp; timeline</th>
                  <th>Bank / Files</th>
                  <th></th>
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
                        {(t.urgent || t.remaining_requested_at) && (
                          <div>
                            <span className="urgent-badge">URGENT</span>
                          </div>
                        )}
                        <div className="muted tiny">{ticketDayCountLabel(t)}</div>
                        <div className="muted tiny">Inv #{t.invoice_number ?? '—'}</div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong>{t.profiles?.full_name ?? '—'}</strong>
                          <span className="muted tiny">{t.profiles?.email}</span>
                          <span className="muted tiny">{t.departments?.name ?? '—'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span>{t.purpose ?? '—'}</span>
                          <span className="muted tiny">{t.subject}</span>
                          {t.remark && <span className="muted tiny">User: {t.remark}</span>}
                          {t.ceo_remark && <span className="muted tiny">CEO: {t.ceo_remark}</span>}
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
                              Invoice left {formatCurrency(invoiceLeft)}
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
                        <div className="cell-stack ticket-timeline">
                          <StatusBadge status={t.status} />
                          <span className="muted tiny">
                            Created — {t.profiles?.full_name ?? 'User'} ·{' '}
                            {formatDateTime(t.created_at)}
                          </span>
                          {(() => {
                            const approvals = getApprovalEntries(t)
                            if (approvals.length > 0) {
                              return approvals.map((a, i) => (
                                <span className="muted tiny" key={`ap-${i}`}>
                                  {a.action} — {a.by} · {formatDateTime(a.at)}
                                  {a.remark ? ` · “${a.remark}”` : ''}
                                </span>
                              ))
                            }
                            // legacy tickets without approval_history
                            return (
                              <>
                                {t.ceo_approved_at ? (
                                  <span className="muted tiny">
                                    CEO {t.status === 'rejected' ? 'rejected' : 'approved'} —{' '}
                                    {t.ceo_approved_by_name ?? 'CEO'} ·{' '}
                                    {formatDateTime(t.ceo_approved_at)}
                                    {t.ceo_remark ? ` · “${t.ceo_remark}”` : ''}
                                  </span>
                                ) : null}
                                {t.remaining_requested_at && (
                                  <span className="muted tiny">
                                    Remaining requested ·{' '}
                                    {formatDateTime(t.remaining_requested_at)}
                                  </span>
                                )}
                              </>
                            )
                          })()}
                          {t.status === 'awaiting_team_head' && (
                            <span className="muted tiny">Waiting Team Head approval…</span>
                          )}
                          {t.status === 'awaiting_ceo' && (
                            <span className="muted tiny">Waiting CEO approval…</span>
                          )}
                          {(() => {
                            const pays = getPaymentEntries(t)
                            if (pays.length > 0) {
                              return pays.map((p, i) => (
                                <span className="muted tiny" key={`pay-${i}`}>
                                  Paid {p.amount} — {p.by} · UTR {p.utr} ·{' '}
                                  {formatDateTime(p.at)}
                                </span>
                              ))
                            }
                            return t.paid_at ? (
                              <span className="muted tiny">
                                Finance paid — {t.paid_by_name ?? 'Finance'} ·{' '}
                                {formatCurrency(paid)} · {formatDateTime(t.paid_at)}
                              </span>
                            ) : null
                          })()}
                          {(t.status === 'pending' || t.status === 'partial') &&
                            pendingAmt > 0 && (
                              <span className="muted tiny">Waiting Finance payment…</span>
                            )}
                          {t.completed_at ? (
                            <span className="muted tiny">
                              Completed · {formatDateTime(t.completed_at)}
                              {t.completion_remark ? ` · “${t.completion_remark}”` : ''}
                            </span>
                          ) : t.status === 'paid' ? (
                            <span className="muted tiny">Waiting user completion…</span>
                          ) : null}
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
                          <span>{t.bank_name ?? '—'}</span>
                          <span className="muted tiny">{t.account_number ?? '—'}</span>
                          <span className="muted tiny">{t.ifsc_code ?? '—'}</span>
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
                          {t.cheque_path && (
                            <a href={getPublicUrl(t.cheque_path)} target="_blank" rel="noreferrer">
                              {t.cheque_name || 'Pay cheque'}
                            </a>
                          )}
                          {t.completion_path && (
                            <a
                              href={getPublicUrl(t.completion_path)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t.completion_name || 'Completion'}
                            </a>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDetailTicket(t)}
                        >
                          Full details
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredTickets.length === 0 && (
              <p className="empty-hint">
                {ticketSearch ? `No tickets match “${ticketSearch}”.` : 'No tickets for this status.'}
              </p>
            )}
          </div>
        </section>
      )}

      <Modal
        open={!!detailTicket}
        title={detailTicket ? `Ticket ${detailTicket.ticket_code}` : 'Ticket'}
        onClose={() => setDetailTicket(null)}
        wide
      >
        {detailTicket && (
          <div className="stack-form">
            <div className="btn-row" style={{ marginBottom: '0.5rem' }}>
              <StatusBadge status={detailTicket.status} />
              {(detailTicket.urgent || detailTicket.remaining_requested_at) && (
                <span className="urgent-badge">URGENT</span>
              )}
              <span className={`priority-badge priority-${detailTicket.priority || 'medium'}`}>
                {priorityLabel(detailTicket.priority)}
              </span>
              <span className="muted tiny">{ticketDayCountLabel(detailTicket)}</span>
            </div>

            <h4 className="detail-section-title">Amounts</h4>
            <div className="info-grid">
              <div>
                <span>Invoice amount</span>
                <strong>{formatCurrency(Number(detailTicket.amount))}</strong>
              </div>
              <div>
                <span>Payable (this cycle)</span>
                <strong>
                  {formatCurrency(getPayableTarget(detailTicket))}
                  {detailTicket.payable_percent != null && !detailTicket.remaining_requested_at
                    ? ` (${detailTicket.payable_percent}%)`
                    : ''}
                </strong>
              </div>
              <div>
                <span>Paid amount</span>
                <strong>{formatCurrency(getPaidTotal(detailTicket))}</strong>
              </div>
              <div>
                <span>Still to pay now</span>
                <strong className="pending-amt">
                  {formatCurrency(getPendingAmount(detailTicket))}
                </strong>
              </div>
              <div>
                <span>Invoice remaining</span>
                <strong>{formatCurrency(getInvoiceRemaining(detailTicket))}</strong>
              </div>
              <div>
                <span>Last payment</span>
                <strong>
                  {detailTicket.last_payment_amount != null
                    ? formatCurrency(Number(detailTicket.last_payment_amount))
                    : '—'}
                </strong>
              </div>
            </div>

            <h4 className="detail-section-title">Who / when</h4>
            <div className="info-grid">
              <div>
                <span>Created by</span>
                <strong>{detailTicket.profiles?.full_name ?? '—'}</strong>
                <span className="muted tiny">{detailTicket.profiles?.email}</span>
                <span className="muted tiny">{formatDateTime(detailTicket.created_at)}</span>
              </div>
              <div>
                <span>Department</span>
                <strong>{detailTicket.departments?.name ?? '—'}</strong>
              </div>
              <div>
                <span>Team Head approval</span>
                <strong>
                  {detailTicket.team_head_approved_by_name ?? 'Not required / not yet approved'}
                </strong>
                <span className="muted tiny">
                  {detailTicket.team_head_approved_at
                    ? formatDateTime(detailTicket.team_head_approved_at)
                    : '—'}
                </span>
                {detailTicket.team_head_remark && (
                  <span className="muted tiny">
                    Remark: {detailTicket.team_head_remark}
                  </span>
                )}
              </div>
              <div>
                <span>CEO approval</span>
                <strong>
                  {detailTicket.ceo_approved_by_name
                    ? `${detailTicket.ceo_approved_by_name}${
                        detailTicket.status === 'rejected' ? ' (rejected)' : ''
                      }`
                    : 'Not yet'}
                </strong>
                <span className="muted tiny">
                  {detailTicket.ceo_approved_at
                    ? formatDateTime(detailTicket.ceo_approved_at)
                    : '—'}
                </span>
                {detailTicket.ceo_remark && (
                  <span className="muted tiny">Remark: {detailTicket.ceo_remark}</span>
                )}
              </div>
              <div>
                <span>Remaining pay request</span>
                <strong>
                  {detailTicket.remaining_requested_at
                    ? formatDateTime(detailTicket.remaining_requested_at)
                    : 'Not requested'}
                </strong>
              </div>
              <div>
                <span>Finance payment</span>
                <strong>{detailTicket.paid_by_name ?? 'Not paid yet'}</strong>
                <span className="muted tiny">
                  {detailTicket.paid_at ? formatDateTime(detailTicket.paid_at) : '—'}
                </span>
                {getUtrNumbers(detailTicket).length > 0 && (
                  <span className="muted tiny">
                    UTRs: {getUtrNumbers(detailTicket).join(', ')}
                  </span>
                )}
              </div>
              <div>
                <span>User completion</span>
                <strong>
                  {detailTicket.completed_at
                    ? formatDateTime(detailTicket.completed_at)
                    : 'Not completed'}
                </strong>
                {detailTicket.completion_remark && (
                  <span className="muted tiny">Remark: {detailTicket.completion_remark}</span>
                )}
              </div>
            </div>

            <h4 className="detail-section-title">Invoice &amp; bank</h4>
            <div className="info-grid">
              <div>
                <span>Subject</span>
                <strong>{detailTicket.subject}</strong>
              </div>
              <div>
                <span>Purpose</span>
                <strong>{detailTicket.purpose ?? '—'}</strong>
              </div>
              <div>
                <span>User remark</span>
                <strong>{detailTicket.remark ?? '—'}</strong>
              </div>
              <div>
                <span>Invoice number</span>
                <strong>{detailTicket.invoice_number ?? '—'}</strong>
              </div>
              <div>
                <span>Bank name</span>
                <strong>{detailTicket.bank_name ?? '—'}</strong>
              </div>
              <div>
                <span>Account number</span>
                <strong>{detailTicket.account_number ?? '—'}</strong>
              </div>
              <div>
                <span>IFSC</span>
                <strong>{detailTicket.ifsc_code ?? '—'}</strong>
              </div>
              <div>
                <span>Due date</span>
                <strong>
                  {detailTicket.due_at ? formatDateTime(detailTicket.due_at) : '—'}
                </strong>
              </div>
            </div>

            <h4 className="detail-section-title">Approval history</h4>
            {getApprovalEntries(detailTicket).length > 0 ? (
              <div className="history-list">
                {getApprovalEntries(detailTicket).map((a, i) => (
                  <div className="history-row" key={`dap-${i}`}>
                    <strong>{a.action}</strong>
                    <span className="muted tiny">
                      {a.by} · {formatDateTime(a.at)}
                      {a.remark ? ` · “${a.remark}”` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : detailTicket.ceo_approved_at ? (
              <p className="muted tiny">
                CEO {detailTicket.status === 'rejected' ? 'rejected' : 'approved'} —{' '}
                {detailTicket.ceo_approved_by_name ?? 'CEO'} ·{' '}
                {formatDateTime(detailTicket.ceo_approved_at)}
                {detailTicket.ceo_remark ? ` · “${detailTicket.ceo_remark}”` : ''}
              </p>
            ) : (
              <p className="muted tiny">No approvals yet.</p>
            )}

            <h4 className="detail-section-title">Payment history</h4>
            {getPaymentEntries(detailTicket).length > 0 ? (
              <div className="history-list">
                {getPaymentEntries(detailTicket).map((p, i) => (
                  <div className="history-row" key={`dpay-${i}`}>
                    <strong>{p.amount}</strong>
                    <span className="muted tiny">
                      {p.by} · UTR {p.utr} · {formatDateTime(p.at)}
                      {p.paymentDate ? ` · Bank date ${p.paymentDate}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : detailTicket.paid_at ? (
              <p className="muted tiny">
                {detailTicket.paid_by_name ?? 'Finance'} paid{' '}
                {formatCurrency(getPaidTotal(detailTicket))} ·{' '}
                {formatDateTime(detailTicket.paid_at)}
              </p>
            ) : (
              <p className="muted tiny">No payments recorded yet.</p>
            )}

            <h4 className="detail-section-title">Files</h4>
            <div className="btn-row" style={{ flexWrap: 'wrap' }}>
              <a
                className="btn btn-ghost btn-sm"
                href={getPublicUrl(detailTicket.bill_path)}
                target="_blank"
                rel="noreferrer"
              >
                Invoice attachment
              </a>
              {detailTicket.user_cheque_path && (
                <a
                  className="btn btn-ghost btn-sm"
                  href={getPublicUrl(detailTicket.user_cheque_path)}
                  target="_blank"
                  rel="noreferrer"
                >
                  User cheque
                </a>
              )}
              {detailTicket.cheque_path && (
                <a
                  className="btn btn-ghost btn-sm"
                  href={getPublicUrl(detailTicket.cheque_path)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {detailTicket.cheque_name || 'Pay cheque'}
                </a>
              )}
              {detailTicket.completion_path && (
                <a
                  className="btn btn-ghost btn-sm"
                  href={getPublicUrl(detailTicket.completion_path)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {detailTicket.completion_name || 'Completion file'}
                </a>
              )}
            </div>

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setDetailTicket(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {tab === 'users' && (
        <section className="card">
          <div className="toolbar">
            <div>
              <h2 style={{ margin: 0 }}>All users (ID & password)</h2>
              <p className="muted" style={{ marginBottom: 0 }}>View and manage account logins.</p>
            </div>
            <div className="btn-row">
              <SearchBox
                value={userSearch}
                onChange={setUserSearch}
                placeholder="Search name, email, role…"
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPasswords((v) => !v)}>
                {showPasswords ? 'Hide passwords' : 'Show passwords'}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={exportUsersExcel}>
                Download Excel
              </button>
            </div>
          </div>
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email / ID</th>
                  <th>Password</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Approved</th>
                  <th>Joined</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const cred = credByUserId.get(u.id)
                  return (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>
                        {cred ? (
                          <code>{showPasswords ? cred.password_text : '••••••••'}</code>
                        ) : (
                          <span className="muted tiny">Not saved yet</span>
                        )}
                      </td>
                      <td>
                        {u.role === 'user' || u.role === 'team_head' ? (
                          <select
                            value={u.department_id ?? ''}
                            onChange={(e) => updateUserDepartment(u.id, e.target.value)}
                          >
                            <option value="">—</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="muted tiny">—</span>
                        )}
                      </td>
                      <td>
                        <select
                          value={u.role}
                          onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                        >
                          <option value="user">User</option>
                          <option value="team_head">Team Head</option>
                          <option value="finance">Finance</option>
                          <option value="ceo">CEO</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        {u.is_approved === false ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => approveUser(u.id)}
                          >
                            Approve
                          </button>
                        ) : (
                          <span className="muted tiny">Yes</span>
                        )}
                      </td>
                      <td>{formatDate(u.created_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => savePasswordRecord(u.id, u.email, u.full_name, u.role)}
                        >
                          {cred ? 'Update pwd' : 'Save pwd'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <p className="empty-hint">
                {userSearch ? `No users match “${userSearch}”.` : 'No users found.'}
              </p>
            )}
          </div>
        </section>
      )}

      {tab === 'create-user' && (
        <section className="card" style={{ maxWidth: 480 }}>
          <h2>Create user</h2>
          <p className="muted">Creates login and stores password for the admin list.</p>
          <form className="stack-form" onSubmit={createUser}>
            <label>
              Full name
              <input required value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
            </label>
            <label>
              Email / User ID
              <input
                required
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                required
                type="text"
                minLength={6}
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
            </label>
            <label>
              Role
              <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as UserRole)}>
                <option value="user">User</option>
                <option value="team_head">Team Head</option>
                <option value="finance">Finance</option>
                <option value="ceo">CEO</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {(newUserRole === 'user' || newUserRole === 'team_head') && (
              <label>
                Department <span className="req">*</span>
                <select
                  required
                  value={newUserDepartmentId}
                  onChange={(e) => setNewUserDepartmentId(e.target.value)}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!credByUserId.get(profile?.id ?? '') && (
              <label>
                Your admin password (to stay signed in)
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Required first time"
                />
              </label>
            )}
            <button type="submit" className="btn btn-primary" disabled={creatingUser}>
              {creatingUser ? 'Creating…' : 'Save user'}
            </button>
          </form>
        </section>
      )}

      {tab === 'departments' && (
        <section className="card" style={{ maxWidth: 520 }}>
          <div className="toolbar">
            <div>
              <h2 style={{ margin: 0 }}>Departments</h2>
              <p className="muted" style={{ marginBottom: 0 }}>Add departments like Outsourcer, Invent, etc.</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={exportDepartmentsExcel}>
              Download Excel
            </button>
          </div>
          <SearchBox
            value={deptSearch}
            onChange={setDeptSearch}
            placeholder="Search department…"
          />
          <form className="inline-form" onSubmit={addDepartment} style={{ marginTop: '1rem' }}>
            <input
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              placeholder="Department name"
              required
            />
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </form>
          <ul className="dept-list">
            {filteredDepartments.map((d) => (
              <li key={d.id}>
                <span>{d.name}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDepartment(d.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {filteredDepartments.length === 0 && (
            <p className="empty-hint">
              {deptSearch ? `No departments match “${deptSearch}”.` : 'No departments yet.'}
            </p>
          )}
        </section>
      )}

      {tab === 'department-approvals' && (
        <section className="card">
          <h2>Department-wise approval &amp; email configuration</h2>
          <p className="muted">
            Choose <strong>Team Head → CEO</strong> for departments that need an internal approval,
            or <strong>Direct to CEO</strong>. Team Head emails receive the first approval alert.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Approval route</th>
                  <th>Team Head email(s)</th>
                  <th>Assigned Team Head login(s)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => {
                  const assignedHeads = users.filter(
                    (user) =>
                      user.role === 'team_head' && user.department_id === department.id,
                  )
                  return (
                    <tr key={department.id}>
                      <td>
                        <strong>{department.name}</strong>
                      </td>
                      <td>
                        <select
                          value={
                            department.requires_team_head_approval ? 'team_head' : 'direct_ceo'
                          }
                          onChange={(e) => {
                            const requires = e.target.value === 'team_head'
                            setDepartments((current) =>
                              current.map((item) =>
                                item.id === department.id
                                  ? { ...item, requires_team_head_approval: requires }
                                  : item,
                              ),
                            )
                          }}
                        >
                          <option value="direct_ceo">Direct to CEO</option>
                          <option value="team_head">Team Head → CEO</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          value={department.team_head_emails ?? ''}
                          disabled={!department.requires_team_head_approval}
                          onChange={(e) => {
                            const value = e.target.value
                            setDepartments((current) =>
                              current.map((item) =>
                                item.id === department.id
                                  ? { ...item, team_head_emails: value }
                                  : item,
                              ),
                            )
                          }}
                          placeholder="head@ev91riderz.com"
                        />
                        <div className="muted tiny">Comma-separated for multiple heads.</div>
                      </td>
                      <td>
                        {assignedHeads.length > 0 ? (
                          <div className="cell-stack">
                            {assignedHeads.map((head) => (
                              <span key={head.id} className="muted tiny">
                                {head.full_name} · {head.email}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="muted tiny">
                            {department.requires_team_head_approval
                              ? 'Create a Team Head user for this department.'
                              : 'Not required'}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void saveDepartmentApproval(department)}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'emails' && (
        <>
          <section className="card" style={{ maxWidth: 640 }}>
            <h2>Email alerts</h2>
            <p className="muted">
              Set Admin / Finance / CEO emails manually (comma-separated). User email is taken from the
              database. One ticket event = one mail_log (duplicates blocked).
            </p>
            <form className="stack-form" onSubmit={saveEmailSettings}>
              <label>
                Admin emails
                <input
                  value={adminEmails}
                  onChange={(e) => setAdminEmails(e.target.value)}
                  placeholder="admin@company.com, boss@company.com"
                />
              </label>
              <label>
                Finance emails
                <input
                  value={financeEmails}
                  onChange={(e) => setFinanceEmails(e.target.value)}
                  placeholder="finance@company.com"
                />
              </label>
              <label>
                CEO emails
                <input
                  value={ceoEmails}
                  onChange={(e) => setCeoEmails(e.target.value)}
                  placeholder="ceo@company.com"
                />
              </label>
              <label>
                Google Apps Script URL
                <input
                  value={mailWebhookUrl}
                  onChange={(e) => setMailWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/..../exec"
                />
              </label>
              <p className="muted tiny">
                Setup: copy code from google-apps-script/VoicEV91-Mail.gs → script.google.com → Deploy as
                Web app → paste URL here. Full steps in docs/EMAIL-SETUP.md.
              </p>
              <button type="submit" className="btn btn-primary" disabled={savingEmails}>
                {savingEmails ? 'Saving…' : 'Save email settings'}
              </button>
            </form>
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <h2>Mail log tracker</h2>
            <p className="muted">
              Search by ticket (e.g. AWPBU003). Each row is one send attempt — same ticket + same event
              cannot create a second row.
            </p>
            <SearchBox
              value={mailLogSearch}
              onChange={setMailLogSearch}
              placeholder="Search ticket / event / email…"
            />
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Ticket</th>
                    <th>Event</th>
                    <th>To (count)</th>
                    <th>Status</th>
                    <th>Dedupe key</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMailLogs.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.created_at)}</td>
                      <td>{row.ticket_code || '—'}</td>
                      <td>{row.event_type}</td>
                      <td title={row.recipients}>
                        {(row.recipient_count ?? 0) > 0
                          ? `${row.recipient_count}: ${row.recipients}`
                          : row.recipients}
                      </td>
                      <td>
                        <span className={`chip ${row.status === 'sent' ? 'active' : ''}`}>
                          {row.status}
                        </span>
                        {row.error_message ? (
                          <div className="muted tiny">{row.error_message}</div>
                        ) : null}
                      </td>
                      <td className="muted tiny">{row.dedupe_key || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredMailLogs.length === 0 && (
                <p className="empty-hint">
                  {mailLogSearch
                    ? `No mail logs match “${mailLogSearch}”.`
                    : 'No mails logged yet. Run patch-mail-logs-dedupe.sql if this fails to load.'}
                </p>
              )}
            </div>
          </section>
        </>
      )}

      {tab === 'export' && (
        <section className="card">
          <h2>Excel download</h2>
          <p className="muted">Download VoicEV91 data as `.xlsx` files for Excel / Google Sheets.</p>
          <div className="export-grid">
            <div className="export-card">
              <h3>All tickets</h3>
              <p>{stats.total} rows</p>
              <button type="button" className="btn btn-primary" onClick={() => exportTicketsExcel('all')}>
                Download tickets
              </button>
            </div>
            <div className="export-card">
              <h3>Pending only</h3>
              <p>{stats.pending} rows</p>
              <button type="button" className="btn btn-primary" onClick={() => exportTicketsExcel('pending')}>
                Download pending
              </button>
            </div>
            <div className="export-card">
              <h3>Paid only</h3>
              <p>{stats.paid} rows</p>
              <button type="button" className="btn btn-primary" onClick={() => exportTicketsExcel('paid')}>
                Download paid
              </button>
            </div>
            <div className="export-card">
              <h3>Completed only</h3>
              <p>{stats.completed} rows</p>
              <button type="button" className="btn btn-primary" onClick={() => exportTicketsExcel('completed')}>
                Download completed
              </button>
            </div>
            <div className="export-card">
              <h3>Users & passwords</h3>
              <p>{users.length} rows</p>
              <button type="button" className="btn btn-primary" onClick={exportUsersExcel}>
                Download users
              </button>
            </div>
            <div className="export-card">
              <h3>Departments</h3>
              <p>{departments.length} rows</p>
              <button type="button" className="btn btn-primary" onClick={exportDepartmentsExcel}>
                Download departments
              </button>
            </div>
          </div>
          <div style={{ marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-ghost" onClick={exportAllExcel}>
              Download all files
            </button>
          </div>
        </section>
      )}
    </Layout>
  )
}
