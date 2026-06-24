import { useState, useEffect } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./supabase"

// ── Auth state hook ───────────────────────────────────────────────────────────

export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  return session
}

// ── Reload IT logo (same as MetlSpec) ────────────────────────────────────────

function ReloadLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1659 422" height="38" width="150" role="img" aria-label="Reload IT" style={{ display: "block" }}>
      <g transform="translate(64.00,64.00) scale(0.80000)">
        <g transform="translate(-113.5,-49.0)">
          <g transform="translate(0.000000,600.000000) scale(0.100000,-0.100000)">
            <path fill="#E8511A" d="M3780 4105 c-30 -8 -91 -19 -135 -25 -44 -6 -120 -20 -170 -31 -49 -11 -133 -29 -185 -41 -52 -11 -115 -27 -140 -34 -25 -7 -61 -15 -80 -19 -37 -6 -149 -34 -420 -105 -178 -47 -349 -98 -380 -115 -14 -7 -41 -16 -60 -20 -19 -4 -51 -16 -70 -26 -19 -11 -39 -19 -43 -19 -8 0 -92 -40 -167 -80 -99 -52 -218 -166 -255 -243 -30 -65 -55 -167 -55 -231 0 -144 83 -305 227 -436 53 -48 255 -190 271 -190 4 0 32 -17 62 -38 30 -20 66 -43 80 -50 14 -7 43 -24 65 -37 22 -14 51 -30 65 -37 14 -7 48 -26 75 -43 28 -16 62 -37 77 -45 15 -8 99 -56 185 -106 87 -50 165 -94 173 -97 8 -4 33 -18 55 -32 22 -13 54 -30 70 -39 17 -8 64 -35 105 -60 41 -25 89 -52 107 -61 27 -13 148 -15 895 -15 475 0 867 0 872 0 20 0 -19 31 -77 60 -34 17 -81 43 -104 58 -125 80 -412 248 -500 292 -23 12 -58 32 -77 45 -19 13 -79 47 -132 76 -54 28 -116 62 -138 74 -23 13 -66 35 -96 50 -30 16 -101 54 -157 87 -56 32 -104 58 -106 58 -3 0 -47 25 -98 56 -52 31 -107 63 -124 71 -75 35 -330 180 -415 237 -63 42 -153 134 -173 178 -40 85 -13 189 75 291 58 67 365 282 493 346 22 11 72 38 110 61 39 22 84 46 100 54 38 18 276 155 293 168 36 30 -7 35 -98 13z"/>
            <path fill="#FFFFFF" d="M2280 5504 c-30 -2 -134 -8 -230 -14 -96 -5 -294 -15 -439 -20 -296 -12 -460 -25 -474 -39 -12 -12 26 -19 158 -26 61 -3 151 -12 200 -20 50 -7 124 -16 165 -20 41 -4 102 -13 135 -20 33 -7 92 -16 130 -20 39 -3 97 -12 130 -19 39 -4 104 -14 145 -21 85 -16 224 -40 350 -60 118 -18 252 -42 335 -59 39 -9 97 -18 130 -22 33 -4 71 -11 85 -16 14 -6 63 -16 110 -24 195 -33 406 -87 565 -145 168 -61 285 -111 390 -166 74 -39 235 -186 235 -214 0 -7 6 -20 14 -28 15 -19 41 -98 51 -158 8 -50 -16 -147 -53 -213 -43 -77 -111 -152 -206 -228 -84 -69 -306 -222 -320 -222 -3 0 -32 -18 -63 -40 -32 -22 -63 -40 -69 -40 -6 0 -16 -6 -22 -13 -6 -6 -39 -27 -74 -46 -35 -18 -81 -44 -103 -57 -22 -13 -53 -31 -70 -40 -88 -49 -196 -128 -193 -141 3 -14 113 -95 181 -133 23 -13 188 -110 242 -143 11 -7 31 -19 45 -28 14 -9 52 -31 85 -48 33 -18 78 -43 100 -56 22 -13 54 -30 70 -39 39 -19 155 -85 284 -161 123 -72 165 -96 251 -142 36 -19 83 -45 105 -58 22 -13 54 -31 70 -39 17 -9 48 -27 70 -41 22 -13 49 -28 61 -34 11 -5 37 -20 57 -34 21 -14 57 -35 80 -47 23 -12 60 -33 82 -46 22 -13 54 -30 70 -39 17 -8 48 -26 70 -40 22 -14 47 -28 55 -32 8 -4 40 -23 70 -42 30 -20 67 -42 82 -51 25 -14 247 -144 336 -197 20 -12 47 -27 60 -32 13 -7 165 -12 380 -15 196 -3 368 -6 381 -8 48 -6 30 21 -41 61 -96 54 -103 59 -171 103 -32 21 -61 38 -65 38 -4 0 -32 17 -62 38 -30 21 -97 63 -148 93 -51 29 -110 64 -130 76 -20 12 -50 29 -67 37 -16 9 -47 26 -67 39 -21 12 -59 35 -85 51 -26 16 -84 52 -128 81 -44 28 -126 79 -183 111 -56 32 -118 68 -136 79 -185 110 -182 108 -281 171 -44 28 -93 59 -110 68 -16 9 -48 28 -70 41 -22 13 -56 33 -75 43 -19 11 -66 41 -103 66 -38 25 -71 46 -74 46 -13 0 -210 136 -245 169 -31 28 -38 42 -38 72 0 33 7 44 53 84 29 25 71 55 93 66 47 26 312 179 445 257 127 76 259 164 340 228 70 56 202 195 241 254 105 162 136 351 83 508 -61 180 -199 318 -441 441 -55 28 -107 51 -115 51 -8 0 -19 4 -25 9 -16 16 -136 56 -289 96 -33 8 -80 22 -105 30 -25 8 -63 17 -85 20 -22 4 -54 11 -71 16 -51 16 -250 49 -384 65 -69 8 -131 17 -139 19 -8 3 -125 12 -260 20 -135 9 -307 19 -381 25 -118 8 -962 11 -1110 4z"/>
          </g>
        </g>
      </g>
      <g fill="#FFFFFF" transform="translate(568.00,284.80) scale(0.20444,-0.20444)">
        <path transform="translate(0.0,0)" d="M64 0V688H440Q511 688 555.0 673.5Q599 659 621.5 630.5Q644 602 652.0 560.0Q660 518 660 462Q660 417 653.5 378.0Q647 339 628.0 309.0Q609 279 570 261L674 0H452L357 276L412 246Q401 239 389.0 237.5Q377 236 363 236H280V0ZM280 381H354Q385 381 403.0 383.5Q421 386 430.5 394.0Q440 402 442.5 417.5Q445 433 445 459Q445 484 443.0 499.5Q441 515 432.0 523.0Q423 531 404.5 534.0Q386 537 354 537H280Z"/>
        <path transform="translate(889.0,0)" d="M65 0V688H593V534H279V423H541V272H279V154H593V0Z"/>
        <path transform="translate(1716.0,0)" d="M65 0V688H280V163H549V0Z"/>
        <path transform="translate(2467.0,0)" d="M372 -8Q278 -8 217.5 2.5Q157 13 123.5 37.0Q90 61 74.5 101.5Q59 142 55.5 202.0Q52 262 52 344Q52 426 55.5 486.0Q59 546 74.5 586.5Q90 627 123.5 651.0Q157 675 217.5 685.5Q278 696 372 696Q466 696 526.0 685.5Q586 675 620.5 651.0Q655 627 670.0 586.5Q685 546 688.5 486.0Q692 426 692 344Q692 262 688.5 202.0Q685 142 670.0 101.5Q655 61 620.5 37.0Q586 13 526.0 2.5Q466 -8 372 -8ZM372 147Q403 147 422.5 149.5Q442 152 453.0 161.5Q464 171 469.0 192.0Q474 213 475.5 249.5Q477 286 477 344Q477 401 475.5 438.0Q474 475 469.0 496.0Q464 517 453.0 526.5Q442 536 422.5 538.5Q403 541 372 541Q342 541 322.0 538.5Q302 536 291.0 526.5Q280 517 275.0 496.0Q270 475 269.0 438.0Q268 401 268 344Q268 286 269.0 249.5Q270 213 275.0 192.0Q280 171 291.0 161.5Q302 152 322.0 149.5Q342 147 372 147Z"/>
        <path transform="translate(3391.0,0)" d="M1 0 222 688H516L737 0H522L486 117H245L210 0ZM287 265H444L370 519H361Z"/>
        <path transform="translate(4308.0,0)" d="M65 0V688H326Q426 688 489.5 678.5Q553 669 589.0 646.5Q625 624 640.5 584.5Q656 545 660.0 486.0Q664 427 664 344Q664 261 660.0 201.5Q656 142 640.5 103.0Q625 64 589.0 41.5Q553 19 489.5 9.5Q426 0 326 0ZM280 154H325Q361 154 384.0 156.5Q407 159 420.5 168.0Q434 177 439.5 197.5Q445 218 446.5 253.0Q448 288 448 343Q448 399 446.5 435.0Q445 471 439.0 491.0Q433 511 420.0 520.5Q407 530 384.0 532.0Q361 534 325 534H280Z"/>
      </g>
    </svg>
  )
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
    <div className="ls-page">
      <div className="ls-inner">

        {/* ── Left: info panel ── */}
        <section className="ls-info">
          <div className="ls-info-glow" aria-hidden />

          <div className="ls-logo"><ReloadLogo /></div>

          <h1 className="ls-title">Metlstk</h1>
          <div className="ls-subtitle">Steel Stockholding ERP</div>
          <div className="ls-accent" />

          <p className="ls-desc">
            Purpose-built for steel stockholders. Manage inventory by batch, trace
            every item back to its mill certificate, and run your whole operation
            from a single system.
          </p>

          <div className="ls-feat-label">Key features</div>
          <ul className="ls-feat-list">
            {FEATURES.map(f => (
              <li key={f} className="ls-feat-item">
                <span className="ls-feat-dot" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="ls-info-footer">
            <span>© 2026 Reload IT Ltd</span>
          </div>
        </section>

        {/* ── Right: auth card ── */}
        <section className="ls-auth">
          <div className="ls-card">
            <form onSubmit={submit}>
              <h2>Welcome back</h2>
              <p>Sign in to your Metlstk account</p>

              <div className="ls-field">
                <label>Email address <span>*</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoComplete="email" autoFocus placeholder="you@company.com" />
              </div>

              <div className="ls-field">
                <label>Password <span>*</span></label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete="current-password" placeholder="••••••••" />
              </div>

              {error && <p className="ls-err">{error}</p>}

              <button type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in →"}
              </button>
            </form>
          </div>
        </section>

      </div>
    </div>
  )
}
