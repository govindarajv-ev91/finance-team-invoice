import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Auth.css'

export function SignupPage() {
  const { signUp, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && profile) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setSubmitting(true)
    // Public signup is user-only; admin/finance are created by admin
    const { error: err } = await signUp(email.trim(), password, fullName.trim(), 'user')
    setSubmitting(false)
    if (err) {
      const lower = err.toLowerCase()
      if (lower.includes('rate limit') || lower.includes('email rate')) {
        setError(
          'Email rate limit exceeded. In Supabase go to Authentication → Providers → Email and turn OFF “Confirm email”, then wait a few minutes and try again (or sign in if the account was already created).',
        )
      } else if (lower.includes('already registered') || lower.includes('already been registered')) {
        setError('This email is already registered. Please sign in instead.')
      } else {
        setError(err)
      }
      return
    }
    setInfo('Account created. You can sign in now.')
    setTimeout(() => navigate('/login'), 900)
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <p className="auth-eyebrow">Join VoicEV91</p>
        <h1>Create account</h1>
        <p className="auth-tagline">Register with your name, email, and password to submit invoices.</p>
      </div>

      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Sign up</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          This form creates a <strong>User</strong> account only. Finance and Admin accounts are created by the admin team.
        </p>
        <label>
          Full name
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
        </label>
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
            placeholder="Min 6 characters"
            autoComplete="new-password"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-success">{info}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
