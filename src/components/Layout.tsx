import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Layout.css'

interface LayoutProps {
  title: string
  children: React.ReactNode
  sidebar?: React.ReactNode
}

export function Layout({ title, children, sidebar }: LayoutProps) {
  const { profile, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <Link to="/" className="brand">
            VoicEV91
          </Link>
          <span className="brand-sub">Finance Invoice Process</span>
        </div>
        <div className="topbar-right">
          <div className="user-chip">
            <span className="user-name">{profile?.full_name}</span>
            <span className="user-role">{profile?.role}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div className={`page-body ${sidebar ? 'with-sidebar' : ''}`}>
        {sidebar && <aside className="sidebar">{sidebar}</aside>}
        <main className="main-panel">
          <h1 className="page-title">{title}</h1>
          {children}
        </main>
      </div>
    </div>
  )
}
