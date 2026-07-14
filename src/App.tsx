import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ProtectedRoute, homeForRole } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { UserDashboard } from './pages/UserDashboard'
import { FinanceDashboard } from './pages/FinanceDashboard'
import { AdminDashboard } from './pages/AdminDashboard'
import { CeoDashboard } from './pages/CeoDashboard'
import { PendingApprovalPage } from './pages/PendingApprovalPage'

function HomeRedirect() {
  const { profile, loading, session } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading VoicEV91…</p>
      </div>
    )
  }

  if (!session || !profile) return <Navigate to="/login" replace />

  return (
    <Navigate
      to={homeForRole(profile.role, profile.is_approved !== false)}
      replace
    />
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/pending-approval"
        element={
          <ProtectedRoute allowUnapproved>
            <PendingApprovalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute roles={['user', 'admin']}>
            <UserDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance"
        element={
          <ProtectedRoute roles={['finance', 'admin']}>
            <FinanceDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ceo"
        element={
          <ProtectedRoute roles={['ceo', 'admin']}>
            <CeoDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
