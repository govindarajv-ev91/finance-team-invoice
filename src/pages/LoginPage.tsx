import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homeForRole } from '../components/ProtectedRoute'
import './Auth.css'

export function LoginPage() {
  const { signIn, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && profile) {
    return (
      <Navigate to={homeForRole(profile.role, profile.is_approved !== false)} replace />
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: err } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (err) {
      const lower = err.toLowerCase()
      if (lower.includes('email not confirmed')) {
        setError(
          'Email not confirmed. In Supabase: Authentication → Providers → Email → turn OFF “Confirm email”, then run supabase/confirm-emails.sql once.',
        )
      } else {
        setError(err)
      }
      return
    }
    navigate('/')
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <p className="auth-eyebrow">Invoice workflow</p>
        <h1>VoicEV91</h1>
        <p className="auth-tagline">Submit bills, track payments, and close tickets in one place.</p>
      </div>

      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Sign in</h2>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-footer">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  )
}
