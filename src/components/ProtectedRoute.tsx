import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/database'

interface ProtectedRouteProps {
  children: React.ReactNode
  roles?: UserRole[]
  /** If true, skip approval check (for pending page itself) */
  allowUnapproved?: boolean
}

function homeForRole(role: UserRole, isApproved: boolean) {
  if (role === 'user' && !isApproved) return '/pending-approval'
  if (role === 'admin') return '/admin'
  if (role === 'team_head') return '/team-head'
  if (role === 'finance') return '/finance'
  if (role === 'ceo') return '/ceo'
  return '/dashboard'
}

export function ProtectedRoute({ children, roles, allowUnapproved }: ProtectedRouteProps) {
  const { profile, loading, session } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading VoicEV91…</p>
      </div>
    )
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />
  }

  const approved = profile.is_approved !== false

  if (profile.role === 'user' && !approved && !allowUnapproved) {
    return <Navigate to="/pending-approval" replace />
  }

  if (allowUnapproved && (profile.role !== 'user' || approved)) {
    return <Navigate to={homeForRole(profile.role, approved)} replace />
  }

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={homeForRole(profile.role, approved)} replace />
  }

  return <>{children}</>
}

export { homeForRole }
