import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  isAllowedEmail,
  REQUIRED_EMAIL_DOMAIN,
  REQUIRED_EMAIL_MESSAGE,
} from '../lib/emailDomain'
import type { Department } from '../types/database'
import './Auth.css'

export function SignupPage() {
  const { signUp, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void supabase
      .from('departments')
      .select('*')
      .order('name')
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message)
          return
        }
        setDepartments(data ?? [])
        if (data?.[0]) setDepartmentId(data[0].id)
      })
  }, [])

  if (!loading && profile) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!isAllowedEmail(email)) {
      setError(REQUIRED_EMAIL_MESSAGE)
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (!departmentId) {
      setError('Please select your department.')
      return
    }
    setSubmitting(true)
    const { error: err } = await signUp(
      email.trim(),
      password,
      fullName.trim(),
      'user',
      departmentId,
    )
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
    setInfo('Account created. Wait for Admin approval, then sign in.')
    setTimeout(() => navigate('/login'), 1200)
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <p className="auth-eyebrow">Join VoicEV91</p>
        <h1>Create account</h1>
        <p className="auth-tagline">Register with your name, email, password and department.</p>
      </div>

      <form className="auth-card" onSubmit={onSubmit}>
        <h2>Sign up</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Each user belongs to <strong>one department</strong>. An Admin must approve you before
          you can open the invoice page.
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
            placeholder={`you@${REQUIRED_EMAIL_DOMAIN}`}
            autoComplete="email"
          />
          <span className="muted tiny">Only @{REQUIRED_EMAIL_DOMAIN} emails are accepted.</span>
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
        <label>
          Department <span className="req">*</span>
          <select
            required
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            {departments.length === 0 && <option value="">Loading…</option>}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-success">{info}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting || !departmentId}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
