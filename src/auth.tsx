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

const FEATURES = [
  "Batch stock with full mill cert traceability",
  "AI-powered goods receipt — upload a PDF, done",
  "Integrated sales, despatch & invoicing",
]

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
    <div className="lp">
      {/* ── Left: marketing panel ── */}
      <aside className="lp-panel">
        <div className="lp-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
            <rect width="28" height="28" rx="7" fill="var(--brand)"/>
            <rect x="6" y="7" width="16" height="3" rx="1.5" fill="white"/>
            <rect x="6" y="12.5" width="16" height="3" rx="1.5" fill="white" opacity=".75"/>
            <rect x="6" y="18" width="10" height="3" rx="1.5" fill="white" opacity=".5"/>
          </svg>
          <span className="lp-logo-name">Metlstk</span>
        </div>

        <div className="lp-hero">
          <p className="lp-tagline">Steel Stockholding ERP</p>
          <h1 className="lp-title">Stock, certs &amp; sales — all in one place.</h1>
          <p className="lp-desc">
            Purpose-built for steel stockholders. Manage inventory by batch, trace every
            item back to its mill certificate, and run your whole operation from a single system.
          </p>
          <ul className="lp-features">
            {FEATURES.map(f => (
              <li key={f}>
                <svg className="lp-check" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="8" cy="8" r="8" fill="rgba(37,99,235,.25)"/>
                  <path d="M4.5 8l2.5 2.5 4.5-5" stroke="var(--brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="lp-footer">© 2026 Reload IT Ltd</p>
      </aside>

      {/* ── Right: sign-in form ── */}
      <main className="lp-form">
        <div className="lp-form-inner">
          <h2>Welcome back</h2>
          <p>Sign in to your Metlstk account</p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email" autoFocus />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password" />
            </label>
            {error && <p className="lp-err">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
