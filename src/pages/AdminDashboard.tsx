import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { SearchBox } from '../components/SearchBox'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { downloadExcel } from '../lib/excel'
import { formatCurrency, formatDate, getPaidTotal, getPendingAmount, getPublicUrl } from '../lib/helpers'
import { matchesSearch } from '../lib/search'
import type { Department, Profile, Ticket, UserRole } from '../types/database'
import './Dashboard.css'

type AdminTab = 'overview' | 'approvals' | 'tickets' | 'users' | 'create-user' | 'departments' | 'export'

interface UserCredential {
  user_id: string
  email: string
  password_text: string
  full_name: string
  role: UserRole
}

const NAV: { id: AdminTab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Status summary' },
  { id: 'approvals', label: 'User approvals', hint: 'Approve signups' },
  { id: 'tickets', label: 'Tickets', hint: 'All invoices' },
  { id: 'users', label: 'Users & passwords', hint: 'Accounts list' },
  { id: 'create-user', label: 'Create user', hint: 'Add login' },
  { id: 'departments', label: 'Departments', hint: 'Manage depts' },
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
    'all' | 'awaiting_ceo' | 'pending' | 'partial' | 'paid' | 'completed' | 'rejected'
  >('all')
  const [showPasswords, setShowPasswords] = useState(false)
  const [ticketSearch, setTicketSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [deptSearch, setDeptSearch] = useState('')

  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<UserRole>('user')
  const [newUserDepartmentId, setNewUserDepartmentId] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)

  const loadAll = useCallback(async () => {
    const [d, u, c, t] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('profiles').select('*, departments(*)').order('created_at', { ascending: false }),
      supabase.from('user_credentials').select('*').order('created_at', { ascending: false }),
      supabase
        .from('tickets')
        .select('*, profiles!user_id(*), departments(*)')
        .order('created_at', { ascending: false }),
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
    if (!newUserDepartmentId && d.data?.[0]) setNewUserDepartmentId(d.data[0].id)
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const credByUserId = useMemo(() => {
    const map = new Map<string, UserCredential>()
    credentials.forEach((c) => map.set(c.user_id, c))
    return map
  }, [credentials])

  const stats = useMemo(() => {
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
    return byStatus.filter((t) =>
      matchesSearch(
        ticketSearch,
        t.ticket_code,
        t.subject,
        t.remark,
        t.amount,
        t.status,
        t.departments?.name,
        t.profiles?.full_name,
        t.profiles?.email,
        t.paid_by_name,
        t.utr_number,
        t.invoice_number,
      ),
    )
  }, [tickets, statusFilter, ticketSearch])

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
    await loadAll()
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
      newUserRole === 'user' ? newUserDepartmentId || null : null,
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
        department_id: newUserRole === 'user' ? newUserDepartmentId || null : null,
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
    status: 'all' | 'awaiting_ceo' | 'pending' | 'partial' | 'paid' | 'completed' | 'rejected' = 'all',
  ) {
    const list = status === 'all' ? tickets : tickets.filter((t) => t.status === status)
    const rows = list.map((t) => ({
      Ticket: t.ticket_code,
      User: t.profiles?.full_name ?? '',
      Email: t.profiles?.email ?? '',
      Department: t.departments?.name ?? '',
      Subject: t.subject,
      'Invoice Number': t.invoice_number ?? '',
      'Bank Name': t.bank_name ?? '',
      'Account Number': t.account_number ?? '',
      'IFSC Code': t.ifsc_code ?? '',
      Remark: t.remark ?? '',
      Amount: Number(t.amount),
      'Paid Amount': t.paid_amount ?? '',
      Pending: getPendingAmount(t),
      Status: t.status,
      'CEO Approved by': t.ceo_approved_by_name ?? '',
      'Paid by': t.paid_by_name ?? '',
      UTR: t.utr_number ?? '',
      'Paid at': t.paid_at ? formatDate(t.paid_at) : '',
      'Completed at': t.completed_at ? formatDate(t.completed_at) : '',
      Created: formatDate(t.created_at),
      'Bill file': t.bill_name,
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
          <div className="filter-tabs" style={{ margin: '1rem 0' }}>
            {(['all', 'awaiting_ceo', 'pending', 'partial', 'paid', 'completed', 'rejected'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${statusFilter === f ? 'active' : ''}`}
                onClick={() => setStatusFilter(f)}
              >
                {f === 'all'
                  ? 'All'
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
                  <th>User</th>
                  <th>Dept</th>
                  <th>Subject / Remark</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Paid by</th>
                  <th>Bill</th>
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
                      </td>
                      <td>{t.profiles?.full_name ?? '—'}</td>
                      <td>{t.departments?.name ?? '—'}</td>
                      <td>
                        <div className="cell-stack">
                          <span>{t.subject}</span>
                          <span className="muted tiny">{t.remark ?? '—'}</span>
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
                          {t.utr_number && <span className="muted tiny">UTR {t.utr_number}</span>}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td>{t.paid_by_name ?? '—'}</td>
                      <td>
                        <a href={getPublicUrl(t.bill_path)} target="_blank" rel="noreferrer">
                          View
                        </a>
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
                        {u.role === 'user' ? (
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
                <option value="finance">Finance</option>
                <option value="ceo">CEO</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {newUserRole === 'user' && (
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
