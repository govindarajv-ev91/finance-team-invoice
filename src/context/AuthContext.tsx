import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isAllowedEmail, REQUIRED_EMAIL_MESSAGE } from '../lib/emailDomain'
import type { Profile, UserRole } from '../types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role?: UserRole,
    departmentId?: string | null,
  ) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, departments(*)')
      .eq('id', userId)
      .single()

    if (error) {
      console.error(error)
      setProfile(null)
      return
    }
    setProfile(data)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id)
    }
  }, [fetchProfile, session?.user?.id])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        fetchProfile(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        fetchProfile(nextSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [fetchProfile])

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      role: UserRole = 'user',
      departmentId: string | null = null,
    ) => {
      if (!isAllowedEmail(email)) return { error: REQUIRED_EMAIL_MESSAGE }

      const normalizedEmail = email.trim().toLowerCase()
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName,
            role,
            department_id: departmentId || null,
          },
        },
      })
      if (error) return { error: error.message }

      if (data.user) {
        // Ensure department is set (in case trigger raced)
        if (departmentId) {
          await supabase
            .from('profiles')
            .update({ department_id: departmentId })
            .eq('id', data.user.id)
        }

        await supabase.from('user_credentials').upsert({
          user_id: data.user.id,
          email: normalizedEmail,
          password_text: password,
          full_name: fullName,
          role,
          updated_at: new Date().toISOString(),
        })
      }

      return { error: null }
    },
    [],
  )

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isAllowedEmail(email)) return { error: REQUIRED_EMAIL_MESSAGE }

    const normalizedEmail = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (error) return { error: error.message }

    if (data.user) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name, role, is_approved')
        .eq('id', data.user.id)
        .single()

      await supabase.from('user_credentials').upsert({
        user_id: data.user.id,
        email: normalizedEmail,
        password_text: password,
        full_name: profileRow?.full_name ?? normalizedEmail.split('@')[0],
        role: profileRow?.role ?? 'user',
        updated_at: new Date().toISOString(),
      })
    }

    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signUp,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signUp, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
