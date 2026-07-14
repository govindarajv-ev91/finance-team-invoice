import { Layout } from '../components/Layout'
import { useAuth } from '../context/AuthContext'

export function PendingApprovalPage() {
  const { profile, signOut } = useAuth()

  return (
    <Layout title="Waiting for admin approval">
      <section className="card" style={{ maxWidth: 520 }}>
        <h2>Account pending</h2>
        <p className="muted">
          Hello <strong>{profile?.full_name}</strong>. Your account (
          <strong>{profile?.email}</strong>) was created successfully.
        </p>
        <p className="muted">
          An <strong>Admin</strong> must approve your account before you can open the invoice
          dashboard. Please wait, then sign in again after approval.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => signOut()}>
          Sign out
        </button>
      </section>
    </Layout>
  )
}
