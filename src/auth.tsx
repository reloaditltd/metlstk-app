import { useState, useEffect } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./supabase"

// ── Auth state hook ───────────────────────────────────────────────────────────

export function useSession(): Session | null | undefined {
  // undefined = loading, null = logged out, Session = logged in
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  return session
}

// ── Login page ────────────────────────────────────────────────────────────────

export function LoginPage() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Metlstk</h1>
        <p>Sign in to continue</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email" autoFocus />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" />
          </label>
          {error && <p className="login-err">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
