import { useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import {
  api,
  type NcrRow,
  type Customer, type CustomerDetail,
  type PurchaseOrder, type PurchaseOrderDetail, type PurchaseOrderLine,
  type SalesOrder, type SalesOrderDetail, type SalesOrderLine,
  type Invoice, type InvoiceDetail,
  type StockItem, type StockItemDetail, type StockItemIn, type StockAttribute,
  type StockBatch,
  type Mtc, type StockSummaryRow, type Allocation,
  type Quote, type QuoteExtractLine,
  type WorkOrder,
  type DeliveryNote,
  type DashboardSummary, type WOReportRow, type CreditHoldRow, type AuditEntry, type AgedDebtorRow,
  type Member, type Setting, type UserMe,
  type Finding, type WizardPatch, type ReadinessLine,
  type Vehicle, type Driver,
  type Supplier, type SupplierDetail, type SupplierPerformance,
  type TermsDocument, type TermsDocumentDetail,
  type OTIFCustomerRow, type OTIFMonthRow, type StockTurnRow, type MarginRow, type StockValuationRow,
  type LowStockRow, type StockAgeRow, type OverdueInvoiceRow, type APRegisterRow, type SalesPerfRow, type SupplierSpendRow, type SalespersonPerfRow, type MonthlyRevenueRow,
  type StatementInvoice, type StatementPayment, type OutstandingLineRow, type OutstandingPOLineRow,
  type SawType, type CutPricingRule,
  type KpiAlert,
  type ForwardContract, type CurrencyRate,
  type CertCheckLine, type Load,
  type AccreditationLogo,
  type PostingRun, type UnpostedSummary,
  type StockAdjustment,
  type ScrapHolding, type ScrapDisposal,
  type SubcontractOrder,
  type MachineRow, type ScheduleEntry, type BookedSlot, type UnscheduledWO,
  type EdiPartner, type EdiTransaction,
  portalApi, portalLogin,
  type PortalMe, type PortalOrder, type PortalAccount, type PortalInvoice,
  type Notification, type NotifPref,
} from "./api"

function useDebounce<T>(value: T, ms: number): T {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDv(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return dv
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="search-bar">
      <input
        type="search"
        placeholder="Search…"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}

function Toolbar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="toolbar-row">
      <h1 className="page-h1">{title}</h1>
      {children}
    </div>
  )
}

const WIZARD_STAGES = [
  "Customer & Commercial", "Material Lines", "Pricing",
  "Processing", "Delivery Docs", "Review & Confirm",
]

function StepBar({ stage, onJump }: { stage: number; onJump: (s: number) => void }) {
  return (
    <ol className="stepbar">
      {WIZARD_STAGES.map((label, i) => {
        const n = i + 1
        const cls = n === stage ? "active" : n < stage ? "done" : ""
        return (
          <li key={n} className={cls}>
            <button type="button" onClick={() => onJump(n)} disabled={n > stage}>
              <span className="step-no">{n}</span> {label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function useData<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    fn()
      .then(d => { if (live) { setData(d); setLoading(false) } })
      .catch(e => { if (live) { setError(String(e)); setLoading(false) } })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, loading, error }
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" })
const fmtGbp = (n: number | null | undefined) => (n != null ? gbp.format(n) : "—")
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB") : "—"
function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v)
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map(r => r.map(esc).join(",")).join("\n")
  const a = document.createElement("a")
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv)
  a.download = filename; a.click()
}
// stock_items quantities are stored x10000 (DataFlex) — show real units
const stk = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : (Number(v) / 10000).toLocaleString("en-GB", { maximumFractionDigits: 2 })

// EN material number map — stainless / nickel alloys only; structural grades have no 1.XXXX number.
const EN_MATERIAL: Record<string, string> = {
  "304": "1.4301", "304L": "1.4307", "304H": "1.4948",
  "316": "1.4401", "316L": "1.4404", "316Ti": "1.4571", "316H": "1.4910",
  "310S": "1.4845", "310H": "1.4952",
  "321": "1.4541", "347": "1.4550",
  "409": "1.4512", "410": "1.4006", "420": "1.4028", "430": "1.4016",
  "2205": "1.4462", "2304": "1.4362", "2507": "1.4410",
  "904L": "1.4539", "17-4PH": "1.4542", "15-5PH": "1.4545",
}
// Format a batch/item spec line: "1.4307 (304L) EN 10088-3:2005"
// Returns whatever can be assembled from non-null inputs.
function fmtMaterialSpec(grade: string | null, spec: string | null, finish?: string | null): string {
  const parts: string[] = []
  if (grade) {
    const mat = EN_MATERIAL[grade]
    parts.push(mat ? `${mat} (${grade})` : `(${grade})`)
  }
  if (spec) parts.push(spec)
  if (finish) parts.push(finish)
  return parts.join(" · ")
}

function Badge({ value }: { value: string | null }) {
  if (!value) return <span className="badge">—</span>
  const cls = value.toLowerCase().replace(/[^a-z]/g, "")
  return <span className={`badge badge-${cls}`}>{value}</span>
}

const DERIVED_STATUS_COLOURS: Record<string, string> = {
  open:           "#888",
  part_despatched:"#c47400",
  despatched:     "#1a6bbf",
  part_invoiced:  "#c45800",
  invoiced:       "#1a8a3a",
}
function DerivedStatusBadge({ status }: { status: string }) {
  const color = DERIVED_STATUS_COLOURS[status] ?? "#888"
  const label = status.replace(/_/g, " ")
  return <span className="badge" style={{ color, borderColor: color, fontWeight: 600 }}>{label}</span>
}

// Hover/focus tooltip — a small ⓘ that explains a field or action.
function Tip({ text }: { text: string }) {
  return <span className="tip" data-tip={text} aria-label={text} tabIndex={0} role="note">i</span>
}

// Dropdown menu rendered in a portal at the document root so it escapes ANY
// ancestor overflow clip (table cells, horizontally-scrolling tables, modals).
// Positioned under its anchor; repositions on scroll/resize while open.
function PickerMenu({ anchorRef, open, minWidth, children }: {
  anchorRef: React.RefObject<HTMLElement | null>; open: boolean
  minWidth?: number | string; children: React.ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  useEffect(() => {
    if (!open) { setPos(null); return }
    const el = anchorRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setPos({ top: r.bottom + 2, left: r.left, width: r.width })
    }
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open, anchorRef])
  if (!open || !pos) return null
  return createPortal(
    <div className="picker-menu" style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: minWidth ?? pos.width }}>
      {children}
    </div>,
    document.body,
  )
}

// Predictive customer search — type a code or name, pick from live matches.
function CustomerPicker({ company, value, onChange }: {
  company: string; value: string; onChange: (code: string) => void
}) {
  const [q, setQ] = useState(value)
  const [results, setResults] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)
  const dq = useDebounce(q, 250)
  useEffect(() => { setQ(value) }, [value])
  useEffect(() => {
    if (!open || dq.trim().length < 1) { setResults([]); return }
    let live = true
    api.customers.list(company, 8, 0, dq.trim()).then(r => { if (live) setResults(r) }).catch(() => {})
    return () => { live = false }
  }, [company, dq, open])
  const anchorRef = useRef<HTMLInputElement>(null)
  return (
    <span className="picker-wrap">
      <input ref={anchorRef} value={q} placeholder="Search code or name…" autoComplete="off"
        onChange={e => { setQ(e.target.value); onChange(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      <PickerMenu anchorRef={anchorRef} open={open && results.length > 0}>
        {results.map(c => (
          <div key={c.account_code} className="picker-item"
            onMouseDown={() => { onChange(c.account_code); setQ(c.account_code); setOpen(false) }}>
            <code>{c.account_code}</code>
            <span>{c.name}{c.address_line_1 ? ` · ${c.address_line_1}` : ""}</span>
          </div>
        ))}
      </PickerMenu>
    </span>
  )
}

function SupplierPicker({ company, value, onChange }: {
  company: string; value: string; onChange: (code: string) => void
}) {
  const [q, setQ] = useState(value)
  const [results, setResults] = useState<Supplier[]>([])
  const [open, setOpen] = useState(false)
  const dq = useDebounce(q, 250)
  useEffect(() => { setQ(value) }, [value])
  useEffect(() => {
    if (!open || dq.trim().length < 1) { setResults([]); return }
    let live = true
    api.suppliers.list(company, dq.trim()).then(r => { if (live) setResults(r.slice(0, 8)) }).catch(() => {})
    return () => { live = false }
  }, [company, dq, open])
  const anchorRef = useRef<HTMLInputElement>(null)
  return (
    <span className="picker-wrap">
      <input ref={anchorRef} value={q} placeholder="Search code or name…" autoComplete="off"
        onChange={e => { setQ(e.target.value); onChange(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      <PickerMenu anchorRef={anchorRef} open={open && results.length > 0}>
        {results.map(s => (
          <div key={s.account_code} className="picker-item"
            onMouseDown={() => { onChange(s.account_code); setQ(s.account_code); setOpen(false) }}>
            <code>{s.account_code}</code>
            <span>{s.name}{s.address_line_1 ? ` · ${s.address_line_1}` : ""}</span>
          </div>
        ))}
      </PickerMenu>
    </span>
  )
}

// Predictive stock-code search. Type a partial code or description; pick from the
// dropdown to fill the code (and hand the caller the item so it can autofill description).
function StockPicker({ company, value, onPick, placeholder }: {
  company: string; value: string; onPick: (code: string, item: StockItem | null) => void; placeholder?: string
}) {
  const [q, setQ] = useState(value)
  const [results, setResults] = useState<StockItem[]>([])
  const [open, setOpen] = useState(false)
  const dq = useDebounce(q, 250)
  useEffect(() => { setQ(value) }, [value])
  useEffect(() => {
    if (!open || dq.trim().length < 1) { setResults([]); return }
    let live = true
    api.stock.list(company, { search: dq.trim(), limit: 10 }).then(r => { if (live) setResults(r) }).catch(() => {})
    return () => { live = false }
  }, [company, dq, open])
  const anchorRef = useRef<HTMLInputElement>(null)
  return (
    <span className="picker-wrap">
      <input ref={anchorRef} value={q} placeholder={placeholder ?? "Search code or description…"} autoComplete="off"
        onChange={e => { setQ(e.target.value); onPick(e.target.value.toUpperCase(), null); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      <PickerMenu anchorRef={anchorRef} open={open && results.length > 0} minWidth={520}>
        {results.map(s => (
          <div key={s.account_code} className="picker-item"
            onMouseDown={() => { onPick(s.account_code, s); setQ(s.account_code); setOpen(false) }}>
            <code>{s.account_code}</code>
            <span>{s.description_1 || s.short_description || ""}</span>
          </div>
        ))}
      </PickerMenu>
    </span>
  )
}

function BatchPicker({ company, stockCode, value, onPick }: {
  company: string; stockCode: string; value: string; onPick: (b: StockBatch) => void
}) {
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!stockCode) { setBatches([]); return }
    let live = true
    api.batches.list(company, { account_code: stockCode, status: "available" }).then(r => { if (live) setBatches(r) }).catch(() => {})
    return () => { live = false }
  }, [company, stockCode])
  const anchorRef = useRef<HTMLButtonElement>(null)
  const sel = batches.find(b => b.batch_no === value)
  if (!stockCode) return <span className="picker-wrap"><button disabled style={{ width: "100%" }}>—</button></span>
  return (
    <span className="picker-wrap">
      <button ref={anchorRef} type="button" onClick={() => setOpen(o => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ width: "100%", textAlign: "left" }}
        disabled={batches.length === 0}>
        {sel ? `${sel.batch_no} · ${(sel.qty_available - (sel.qty_allocated ?? 0)).toFixed(2)} free · ${fmtMaterialSpec(sel.grade, sel.spec)}` : batches.length === 0 ? "No batches" : "Select batch…"}
      </button>
      <PickerMenu anchorRef={anchorRef} open={open && batches.length > 0} minWidth={520}>
        {batches.map(b => {
            const free = b.qty_available - (b.qty_allocated ?? 0)
            const low = free <= 0
            return (
              <div key={b.id} className="picker-item"
                onMouseDown={() => { onPick(b); setOpen(false) }}>
                <code style={{ minWidth: "7em" }}>{b.batch_no}</code>
                <span style={{ minWidth: "7em", color: low ? "var(--color-danger, #c00)" : undefined }}>
                  {free.toFixed(2)} free{b.qty_allocated > 0 ? ` (${b.qty_allocated.toFixed(2)} on orders)` : ""}
                </span>
                <span style={{ minWidth: "3em" }}>{b.unit}</span>
                <span style={{ minWidth: "8em" }}>{b.warehouse || "—"}</span>
                <span>{fmtMaterialSpec(b.grade, b.spec)}</span>
              </div>
            )
          })}
      </PickerMenu>
    </span>
  )
}

// Centered modal/popup. Click the backdrop or ✕ to close.
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="modal-close" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

// The logged-in user's own profile — contact details they complete themselves.
export function UserProfile({ company }: { company: string }) {
  const { data, loading } = useData<UserMe>(() => api.me.get(), [])
  const [f, setF] = useState<Partial<UserMe>>({})
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (data) setF(data) }, [data])
  const set = <K extends keyof UserMe>(k: K, v: UserMe[K]) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    try {
      await api.me.update({ full_name: f.full_name, email: f.email, phone: f.phone, mobile: f.mobile, job_title: f.job_title })
      setMsg("Saved")
    } catch (e) { setMsg(String(e)) }
  }
  return (
    <div className="grn-shell">
      <a className="back-link" href={`#/${company}/dashboard`}>← Dashboard</a>
      <h2 className="grn-title">My profile</h2>
      {loading ? <p className="state-msg">Loading…</p> : (
        <div className="grn-form">
          <div className="grn-section">
            <h3>Contact details</h3>
            <div className="grn-grid">
              <label className="grn-label">Full name
                <input className="grn-input" value={f.full_name ?? ""} onChange={e => set("full_name", e.target.value)} /></label>
              <label className="grn-label">Job title
                <input className="grn-input" value={f.job_title ?? ""} onChange={e => set("job_title", e.target.value)} /></label>
              <label className="grn-label">Email
                <input className="grn-input" type="email" value={f.email ?? ""} onChange={e => set("email", e.target.value)} /></label>
              <label className="grn-label">Phone
                <input className="grn-input" value={f.phone ?? ""} onChange={e => set("phone", e.target.value)} /></label>
              <label className="grn-label">Mobile
                <input className="grn-input" value={f.mobile ?? ""} onChange={e => set("mobile", e.target.value)} /></label>
            </div>
          </div>
          <div className="grn-section">
            <h3>Access</h3>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: ".3rem .75rem" }}>
              <dt style={{ color: "var(--text-muted)", fontSize: ".82rem" }}>Role</dt><dd style={{ margin: 0 }}>{data?.role || "—"}</dd>
              <dt style={{ color: "var(--text-muted)", fontSize: ".82rem" }}>Companies</dt><dd style={{ margin: 0 }}>{(data?.companies ?? []).join(", ") || "—"}</dd>
            </dl>
          </div>
          <div className="grn-actions">
            <button className="action-btn" onClick={save}>Save profile</button>
            {msg && <span className="badge">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

const METRIC_LABELS: Record<string, string> = {
  otif_rate: "OTIF Rate",
  aged_debt_60d: "Aged Debt >60d",
  wo_late_pct: "WO Late %",
}

export function KpiAlertBell({ company }: { company: string }) {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState<KpiAlert[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api.kpi.alerts(company, "open").then(setAlerts).catch(() => {})
  }, [company])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  const dismiss = async (id: number, status: "acknowledged" | "dismissed") => {
    await api.kpi.updateAlert(company, id, status)
    setAlerts(a => a.filter(x => x.id !== id))
  }

  return (
    <div className="kpi-bell-wrap" ref={ref} style={{ position: "relative" }}>
      <button className="kpi-bell-btn" onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0.5rem", fontSize: "1.2rem", color: "var(--color-header-fg, #fff)", position: "relative" }}
        aria-label="KPI Alerts" title="KPI Alerts">
        &#128276;
        {alerts.length > 0 && (
          <span style={{
            position: "absolute", top: "-4px", right: "2px",
            background: "#e53e3e", color: "#fff", borderRadius: "999px",
            fontSize: "0.65rem", fontWeight: 700, minWidth: "16px", height: "16px",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px"
          }}>{alerts.length}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 500,
          background: "var(--color-surface, #fff)", border: "1px solid var(--color-border, #e2e8f0)",
          borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          minWidth: "320px", maxWidth: "380px", maxHeight: "420px", overflow: "auto"
        }}>
          <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: "0.9rem" }}>KPI Alerts</strong>
            <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--color-primary, #3182ce)" }}
              onClick={() => { api.kpi.recalculate(company).then(load) }}>Refresh</button>
          </div>
          {alerts.length === 0
            ? <p style={{ padding: "1rem", color: "var(--color-text-muted, #888)", fontSize: "0.85rem", margin: 0 }}>No open alerts</p>
            : alerts.map(a => (
              <div key={a.id} style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border, #e2e8f0)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div>
                    <strong style={{ fontSize: "0.85rem" }}>{METRIC_LABELS[a.metric] ?? a.metric}</strong>
                    <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted, #888)", marginTop: "2px" }}>
                      {a.current_value != null ? `Current: ${a.current_value.toFixed(1)}%` : ""}
                      {a.baseline_mean != null ? ` · Baseline: ${a.baseline_mean.toFixed(1)}%` : ""}
                      {a.z_score != null ? ` · Z: ${a.z_score.toFixed(1)}` : ""}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #888)" }}>{a.alert_date}</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                    <button style={{ fontSize: "0.72rem", padding: "2px 6px", cursor: "pointer" }}
                      onClick={() => dismiss(a.id, "acknowledged")}>Ack</button>
                    <button style={{ fontSize: "0.72rem", padding: "2px 6px", cursor: "pointer" }}
                      onClick={() => dismiss(a.id, "dismissed")}>Dismiss</button>
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

// Slide-out AI assistant — guides the user, lists next steps, answers questions.
export function AssistPanel({ company, screen }: { company: string; screen: string }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string }[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, busy])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...msgs, { role: "user" as const, content: text }]
    setMsgs(next); setInput(""); setBusy(true)
    try {
      const r = await api.assist(company, next, screen)
      setMsgs([...next, { role: "assistant", content: r.reply }])
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: "Sorry — " + String(e) }])
    } finally { setBusy(false) }
  }

  if (!open) return <button className="assist-fab" onClick={() => setOpen(true)}>✦ Assistant</button>
  return (
    <div className="assist-panel">
      <div className="assist-head"><strong>✦ MetlStk Assistant</strong>
        <button className="modal-close" aria-label="Close" style={{ color: "#fff" }} onClick={() => setOpen(false)}>×</button></div>
      <div className="assist-msgs">
        {msgs.length === 0 && <div className="assist-hint">
          Ask me for any report (stock, sales, customers, margins, what needs attention) — or let me
          handle the admin: create a stock code, raise a purchase order, assign a salesperson. I'll
          always confirm the details before making any change.
        </div>}
        {msgs.map((m, i) => <div key={i} className={`assist-msg ${m.role}`}>{m.content}</div>)}
        {busy && <div className="assist-msg assistant">…</div>}
        <div ref={endRef} />
      </div>
      <div className="assist-input">
        <textarea value={input} placeholder="Ask the assistant…" onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button className="action-btn" disabled={busy} onClick={send}>Send</button>
      </div>
    </div>
  )
}

function Pager({
  offset, count, limit, onChange,
}: { offset: number; count: number; limit: number; onChange: (n: number) => void }) {
  return (
    <div className="pager">
      <button disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        ← Prev
      </button>
      <span>{offset + 1}–{offset + count}</span>
      <button disabled={count < limit} onClick={() => onChange(offset + limit)}>
        Next →
      </button>
    </div>
  )
}

function Shell({ loading, error, children }: {
  loading: boolean; error: string | null; children: React.ReactNode
}) {
  // Once content has rendered once, keep it mounted through refetches — so the
  // search box keeps focus and the header stays put; only the table updates.
  const shown = useRef(false)
  if (!shown.current) {
    if (loading) return <p className="state-msg">Loading…</p>
    if (error) return <p className="state-err">{error}</p>
  }
  if (error && !loading) return <p className="state-err">{error}</p>
  shown.current = true
  return <>{children}</>
}

// ── Customers ────────────────────────────────────────────────────────────────

// Quick-look popup: contact details + salesperson allocation.
function CustomerModal({ company, code, onClose }: { company: string; code: string; onClose: () => void }) {
  const { data: c, loading } = useData<CustomerDetail>(() => api.customers.get(company, code), [company, code])
  const [reps, setReps] = useState<{ id: string; name: string }[]>([])
  const [rep, setRep] = useState<string>("")
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => { api.customers.salespeople(company).then(setReps).catch(() => {}) }, [company])
  useEffect(() => { if (c) setRep(c.salesperson_id ?? "") }, [c])
  async function saveRep(v: string) {
    setRep(v)
    try { await api.customers.setSalesperson(company, code, v || null); setSaved("Saved") }
    catch (e) { setSaved(String(e)) }
  }
  const addr = c ? [c.address_line_1, c.address_line_2, c.address_line_3, c.address_line_4, c.postcode].filter(Boolean).join(", ") : ""
  return (
    <Modal title={c?.name || code} onClose={onClose}>
      {loading || !c ? <p className="state-msg">Loading…</p> : (
        <>
          <div className="detail-card" style={{ boxShadow: "none", border: "none", padding: 0, marginBottom: "1rem" }}>
            <dl>
              <dt>Account</dt><dd><code>{c.account_code}</code></dd>
              <dt>Phone</dt><dd>{c.telephone || "—"}</dd>
              <dt>Email</dt><dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : "—"}</dd>
              <dt>Website</dt><dd>{c.website || "—"}</dd>
              <dt>Address</dt><dd>{addr || "—"}</dd>
              <dt>VAT no</dt><dd>{c.vat_number || "—"}</dd>
              <dt>Credit limit</dt><dd>{fmtGbp(c.credit_limit_gbp)}</dd>
              <dt>Balance</dt><dd>{fmtGbp(c.current_balance_gbp)}</dd>
              <dt>Status</dt><dd><Badge value={c.on_hold ? "Hold" : "Active"} /></dd>
            </dl>
          </div>
          <div className="grn-label" style={{ maxWidth: "20rem" }}>
            Salesperson <Tip text="The rep allocated to this customer. They handle the customer's quotes and orders." />
            <select value={rep} onChange={e => saveRep(e.target.value)}>
              <option value="">— Unassigned —</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {saved && <span className="badge" style={{ marginTop: ".5rem", display: "inline-block" }}>{saved}</span>}
          <div style={{ marginTop: "1.25rem" }}>
            <a className="action-btn" href={`#/${company}/customers/${encodeURIComponent(code)}`} style={{ textDecoration: "none" }}>Open full record</a>
          </div>
        </>
      )}
    </Modal>
  )
}

export function CustomerList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q])
  const limit = 50
  const { data, loading, error } = useData<Customer[]>(
    () => api.customers.list(company, limit, offset, q),
    [company, limit, offset, q],
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Customers">
        <SearchBar value={search} onChange={setSearch} />
        <a href={`#/${company}/customers/new`} className="action-btn">+ New customer</a>
      </Toolbar>
      <table>
        <thead>
          <tr>
            <th>Account</th><th>Name</th><th>Phone</th>
            <th className="r">Credit Limit</th><th className="r">Balance</th>
            <th>Opened</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.map(c => (
            <tr key={c.account_code} className="row-link" onClick={() => setSelected(c.account_code)}>
              <td><code>{c.account_code}</code></td>
              <td>{c.name || "—"}</td>
              <td>{c.telephone || "—"}</td>
              <td className="r">{fmtGbp(c.credit_limit_gbp)}</td>
              <td className="r">{fmtGbp(c.current_balance_gbp)}</td>
              <td>{fmtDate(c.account_opened)}</td>
              <td><Badge value={c.on_hold ? "Hold" : "Active"} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager offset={offset} count={data.length} limit={limit} onChange={setOffset} />}
      {selected && <CustomerModal company={company} code={selected} onClose={() => setSelected(null)} />}
    </Shell>
  )
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

function ReorderSuggestions({ company }: { company: string }) {
  const [rev, setRev] = useState(0)
  const { data: suggestions } = useData(
    () => api.demand.suggestions(company, "pending"), [company, rev]
  )
  const [rejectId, setRejectId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  if (!suggestions?.length) return null
  return (
    <details style={{ marginBottom: "1rem", background: "var(--color-card-bg,#f8f8f8)", border: "1px solid var(--border,#ddd)", borderRadius: 6, padding: ".5rem .75rem" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: ".9rem", display: "flex", justifyContent: "space-between" }}>
        <span>Reorder Suggestions ({suggestions.length})</span>
      </summary>
      <table style={{ marginTop: ".5rem", fontSize: ".82rem", width: "100%" }}>
        <thead><tr><th>Stock Code</th><th className="r">Forecast 30d</th><th className="r">Shortage</th><th>Confidence</th><th></th></tr></thead>
        <tbody>
          {suggestions.map(s => (
            <tr key={s.id}>
              <td><code>{s.stock_account_code}</code></td>
              <td className="r">{s.forecast_qty?.toFixed(2) ?? "—"}</td>
              <td className="r" style={s.shortage_qty ? { color: "#b91c1c", fontWeight: 600 } : undefined}>
                {s.shortage_qty?.toFixed(2) ?? "—"}
              </td>
              <td>{s.confidence ?? "—"}</td>
              <td style={{ display: "flex", gap: ".3rem" }}>
                <a className="btn-sm" href={`#/${company}/purchase-orders/new?stock=${encodeURIComponent(s.stock_account_code)}&qty=${s.suggested_qty ?? ""}`}
                  onClick={async () => { await api.demand.accept(company, s.id); setRev(r => r + 1) }}>
                  Accept → PO
                </a>
                {rejectId === s.id
                  ? <span style={{ display: "flex", gap: ".25rem" }}>
                      <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason" style={{ fontSize: ".78rem", width: "8rem" }} />
                      <button className="btn-sm" onClick={async () => { await api.demand.reject(company, s.id, rejectReason); setRejectId(null); setRev(r => r + 1) }}>OK</button>
                      <button className="btn-sm" onClick={() => setRejectId(null)}>×</button>
                    </span>
                  : <button className="btn-sm" onClick={() => { setRejectId(s.id); setRejectReason("") }}>Reject</button>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export function PurchaseOrderList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [offset, setOffset] = useState(0)
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q, statusFilter])
  const limit = 50
  const { data, loading, error } = useData<PurchaseOrder[]>(
    () => api.purchases.listOrders(company, limit, offset, q, statusFilter),
    [company, limit, offset, q, statusFilter],
  )
  return (
    <Shell loading={loading} error={error}>
      <ReorderSuggestions company={company} />
      <Toolbar title="Purchase Orders">
        <SearchBar value={search} onChange={setSearch} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ fontSize: "0.85rem" }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="received">Received</option>
          <option value="closed">Closed</option>
        </select>
        <a className="action-btn" href={`#/${company}/purchase-orders/new`} style={{ textDecoration: "none" }}>+ New PO</a>
      </Toolbar>
      <table>
        <thead>
          <tr>
            <th>Order No</th><th>Supplier</th><th>Ref</th>
            <th>Order Date</th><th>Deliver By</th>
            <th className="r">Net</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.map(o => {
            const today = new Date().toISOString().slice(0, 10)
            const overdueDays = o.deliver_by && o.status === "open" && o.deliver_by < today
              ? Math.floor((Date.now() - new Date(o.deliver_by).getTime()) / 86400000)
              : 0
            return (
              <tr key={o.order_no}>
                <td><a href={`#/${company}/purchase-orders/${encodeURIComponent(o.order_no)}`}><code>{o.order_no}</code></a></td>
                <td><a href={`#/${company}/suppliers/${encodeURIComponent(o.supplier_account)}`}>{o.supplier_name || o.supplier_account}</a></td>
                <td>{o.supplier_ref || "—"}</td>
                <td>{fmtDate(o.order_date)}</td>
                <td style={overdueDays > 0 ? { color: overdueDays > 14 ? "var(--fail, #c0392b)" : "var(--warn, #d68910)", fontWeight: 600 } : undefined}>
                  {fmtDate(o.deliver_by)}{overdueDays > 0 ? ` (${overdueDays}d late)` : ""}
                </td>
                <td className="r">{fmtGbp(o.net_gbp)}</td>
                <td><Badge value={o.status} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {data && <Pager offset={offset} count={data.length} limit={limit} onChange={setOffset} />}
    </Shell>
  )
}

// ── Sales Orders ──────────────────────────────────────────────────────────────

export function SalesOrderList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const [showDrafts, setShowDrafts] = useState(false)
  const [statusFilter, setStatusFilter] = useState("")
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q, statusFilter])
  const limit = 50
  const { data, loading, error } = useData<SalesOrder[]>(
    () => api.sales.listOrders(company, limit, offset, q, showDrafts, statusFilter),
    [company, limit, offset, q, showDrafts, statusFilter],
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Sales Orders">
        <SearchBar value={search} onChange={setSearch} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ fontSize: "0.85rem" }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="confirmed">Confirmed</option>
          <option value="complete">Complete</option>
        </select>
        <label style={{ fontSize: "0.85em", display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <input type="checkbox" checked={showDrafts} onChange={e => setShowDrafts(e.target.checked)} />
          Show drafts
        </label>
        <a className="action-btn" href={`#/${company}/sales-orders/new`}>+ New order</a>
      </Toolbar>
      <table>
        <thead>
          <tr>
            <th>Order No</th><th>Customer</th><th>Ref</th>
            <th>Order Date</th><th>Delivery</th>
            <th className="r">Net</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.map(o => (
            <tr key={o.order_no}>
              <td><a href={`#/${company}/sales-orders/${encodeURIComponent(o.order_no)}`}><code>{o.order_no}</code></a></td>
              <td><a href={`#/${company}/customers/${encodeURIComponent(o.customer_account)}`}>{o.customer_name || o.customer_account}</a></td>
              <td>{o.customer_ref || "—"}</td>
              <td>{fmtDate(o.order_date)}</td>
              <td>{fmtDate(o.delivery_date)}</td>
              <td className="r">{fmtGbp(o.net_gbp)}</td>
              <td><Badge value={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager offset={offset} count={data.length} limit={limit} onChange={setOffset} />}
    </Shell>
  )
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export function InvoiceList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [offset, setOffset] = useState(0)
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q, statusFilter])
  const limit = 50
  const { data, loading, error } = useData<Invoice[]>(
    () => api.sales.listInvoices(company, limit, offset, q, statusFilter),
    [company, limit, offset, q, statusFilter],
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Invoices">
        <SearchBar value={search} onChange={setSearch} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ fontSize: "0.85em" }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="credited">Credited</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {data && data.length > 0 && (
          <button onClick={() => downloadCsv("invoices.csv",
            ["Invoice No", "Customer", "Date", "Net £", "Total £", "Status", "Age (days)"],
            data.map(i => [i.doc_no, i.customer_name || i.customer_account, i.invoice_date ?? "",
              i.net_gbp.toFixed(2), i.total_gbp.toFixed(2), i.status ?? "", i.age_days ?? ""])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <table>
        <thead>
          <tr>
            <th>Invoice No</th><th>Customer</th><th>Date</th>
            <th className="r">Net</th><th className="r">Total</th>
            <th>Status</th><th className="r">Age</th><th>Posted</th>
          </tr>
        </thead>
        <tbody>
          {data?.map(i => (
            <tr key={i.doc_no}>
              <td><a href={`#/${company}/invoices/${encodeURIComponent(i.doc_no)}`}><code>{i.doc_no}</code></a></td>
              <td><a href={`#/${company}/customers/${encodeURIComponent(i.customer_account)}`}>{i.customer_name || i.customer_account}</a></td>
              <td>{fmtDate(i.invoice_date)}</td>
              <td className="r">{fmtGbp(i.net_gbp)}</td>
              <td className="r">{fmtGbp(i.total_gbp)}</td>
              <td><Badge value={i.status ?? "—"} /></td>
              <td className="r" style={{ color: (i.age_days ?? 0) > 60 ? "var(--color-fail,#c00)" : (i.age_days ?? 0) > 30 ? "var(--color-warn,#a06000)" : undefined, fontWeight: (i.age_days ?? 0) > 60 ? 600 : undefined }}>
                {i.age_days != null ? `${i.age_days}d` : "—"}
              </td>
              <td>{i.posted ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager offset={offset} count={data.length} limit={limit} onChange={setOffset} />}
    </Shell>
  )
}

// ── Stock ─────────────────────────────────────────────────────────────────────

// Stock-code attributes (material/section/grade/finish) resolved from the `attributes` lookup.
function useAttributes(company: string) {
  const [attrs, setAttrs] = useState<StockAttribute[]>([])
  useEffect(() => { api.stock.attributes(company).then(setAttrs).catch(console.error) }, [company])
  const bySlot = (slot: number) => attrs.filter(a => a.slot === slot)
  const label = (slot: number, code: string | null) => {
    if (!code) return "—"
    return attrs.find(a => a.slot === slot && a.code === code)?.description || code
  }
  return { bySlot, label }
}

const SLOTS: { slot: number; key: "material" | "section" | "grade" | "finish"; all: string }[] = [
  { slot: 1, key: "material", all: "All materials" },
  { slot: 2, key: "section", all: "All sections" },
  { slot: 3, key: "grade", all: "All grades" },
  { slot: 4, key: "finish", all: "All finishes" },
]

export function StockList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [f, setF] = useState({ material: "", section: "", grade: "", finish: "" })
  const [offset, setOffset] = useState(0)
  const [nlMode, setNlMode] = useState(false)
  const [nlQuery, setNlQuery] = useState("")
  const [nlBusy, setNlBusy] = useState(false)
  const [nlResult, setNlResult] = useState<{ filters: Record<string, string>; interpreted: string; results: StockItem[]; count: number } | null>(null)
  const q = useDebounce(search, 400)   // pause for more characters before refetching
  const { bySlot, label } = useAttributes(company)
  useEffect(() => setOffset(0), [q, f.material, f.section, f.grade, f.finish])
  const limit = 50
  const { data, loading, error } = useData<StockItem[]>(
    () => api.stock.list(company, { limit, offset, search: q, material: f.material || undefined, section: f.section || undefined, grade: f.grade || undefined, finish: f.finish || undefined }),
    [company, limit, offset, q, f.material, f.section, f.grade, f.finish],
  )
  async function runNlSearch() {
    if (!nlQuery.trim()) return
    setNlBusy(true)
    try { setNlResult(await api.stock.nlSearch(company, nlQuery)) }
    catch (e) { alert(String(e)) }
    finally { setNlBusy(false) }
  }
  const displayData = nlMode && nlResult ? nlResult.results : data
  return (
    <Shell loading={loading && !nlMode} error={error}>
      <Toolbar title="Stock">
        {nlMode ? (
          <>
            <input style={{ flex: 1, minWidth: "16rem" }} placeholder="Describe what you need… e.g. stainless 316 plate 20mm" value={nlQuery}
              onChange={e => setNlQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runNlSearch()} />
            <button className="action-btn" onClick={runNlSearch} disabled={nlBusy}>{nlBusy ? "Searching…" : "Search"}</button>
            <button onClick={() => { setNlMode(false); setNlResult(null); setNlQuery("") }}>Form search</button>
          </>
        ) : (
          <>
            <SearchBar value={search} onChange={setSearch} />
            <button onClick={() => setNlMode(true)} title="Natural language search">AI search</button>
            <a className="action-btn" href={`#/${company}/stock/new`} style={{ textDecoration: "none" }}>+ New stock code</a>
          </>
        )}
      </Toolbar>
      {nlMode && nlResult && (
        <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--color-text-muted,#666)", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <span>"{nlResult.interpreted}" · {nlResult.count} result{nlResult.count !== 1 ? "s" : ""}</span>
          {Object.entries(nlResult.filters).map(([k, v]) => (
            <span key={k} className="badge" style={{ cursor: "pointer" }} onClick={() => {
              const newFilters = { ...nlResult.filters }; delete newFilters[k]
              setNlResult({ ...nlResult, filters: newFilters })
            }}>{k}: {v} ×</span>
          ))}
        </div>
      )}
      {!nlMode && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          {SLOTS.map(({ slot, key, all }) => (
            <select key={key} value={f[key]} onChange={e => setF({ ...f, [key]: e.target.value })}>
              <option value="">{all}</option>
              {bySlot(slot).map(a => <option key={a.code} value={a.code}>{a.description || a.code}</option>)}
            </select>
          ))}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Code</th><th>Description</th><th>Material</th><th>Section</th><th>Grade</th><th>Finish</th>
            <th>Unit</th><th className="r">In Stock</th>
            <th className="r">On Order<Tip text="Quantity on open purchase orders, not yet delivered. Booked in on goods-in (GRN)." /></th>
            <th className="r">Free<Tip text="In Stock minus quantity already allocated to sales orders." /></th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {displayData?.map(s => (
            <tr key={s.account_code}>
              <td><a href={`#/${company}/stock/${encodeURIComponent(s.account_code)}`}><code>{s.account_code}</code></a></td>
              <td>{s.description_1 || s.short_description || "—"}</td>
              <td>{label(1, s.attribute_1)}</td>
              <td>{label(2, s.attribute_2)}</td>
              <td>{label(3, s.attribute_3)}</td>
              <td>{label(4, s.attribute_4)}</td>
              <td>{s.stock_unit_1 || "—"}</td>
              <td className="r">{stk(s.stock_qty)}</td>
              <td className="r">{Number(s.po_qty) ? stk(s.po_qty) : "—"}</td>
              <td className="r">{stk(s.free_stock)}</td>
              <td><Badge value={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!nlMode && data && <Pager offset={offset} count={data.length} limit={limit} onChange={setOffset} />}
    </Shell>
  )
}

function StockItemBatches({ company, code }: { company: string; code: string }) {
  const { data, loading } = useData(() => api.stock.batches(company, code), [company, code])
  if (loading || !data) return null
  return (
    <>
      <div className="detail-lines">
        <h3>Batches (with GRN)</h3>
        {data.batches.length === 0 ? <p className="state-msg">No modeled batches yet — created on goods-in.</p> : (
          <table>
            <thead><tr><th>Batch</th><th>Heat</th><th>Cert</th><th>Grade</th><th className="r">Avail</th>
              <th>GRN</th><th>Supplier</th><th>PO</th><th>Del note</th><th>Received</th></tr></thead>
            <tbody>
              {data.batches.map(b => (
                <tr key={b.batch_no}>
                  <td><a href={`#/${company}/batches/${b.batch_no}`}>{b.batch_no}</a></td>
                  <td>{b.heat_no || "—"}</td><td>{b.cert_ref || "—"}</td><td>{b.grade || "—"}</td>
                  <td className="r">{b.qty_available} {b.unit}</td>
                  <td>{b.grn_no ? <a href={`#/${company}/grn/${b.grn_no}`}>{b.grn_no}</a> : "—"}</td>
                  <td>{b.supplier_account
                    ? <a href={`#/${company}/suppliers/${encodeURIComponent(b.supplier_account)}`}>{b.supplier_account}</a>
                    : "—"}</td>
                  <td>{b.purchase_order_no
                    ? <a href={`#/${company}/purchase-orders/${encodeURIComponent(b.purchase_order_no)}`}>{b.purchase_order_no}</a>
                    : "—"}</td>
                  <td>{b.delivery_note_ref || "—"}</td><td>{b.grn_date?.slice(0, 10) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data.legacy_batches.length > 0 && (
        <div className="detail-lines">
          <h3>Historical batches (legacy)</h3>
          <table>
            <thead><tr><th>Txn</th><th>Cast / heat</th><th>Lot</th><th>Mill cert</th><th>Grade</th>
              <th className="r">Qty left</th><th className="r">Allocated</th><th>Location</th></tr></thead>
            <tbody>
              {data.legacy_batches.map(b => (
                <tr key={b.transaction_no}>
                  <td>{b.transaction_no}</td><td>{b.cast_no || "—"}</td><td>{b.lot_no || "—"}</td>
                  <td>{b.mill_cert_no || "—"}</td><td>{b.grade || "—"}</td>
                  <td className="r">{b.qty_left}</td><td className="r">{b.qty_allocated}</td><td>{b.current_location || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ── Helpers for detail views ───────────────────────────────────────────────────

// Raw NUMERIC from SELECT * comes back as a string from Supabase → divide by 100
const pence = (v: unknown) =>
  v != null && v !== "" ? fmtGbp(Number(v) / 100) : "—"

function DetailShell({ loading, error, children }: {
  loading: boolean; error: string | null; children: React.ReactNode
}) {
  if (loading) return <p className="state-msg">Loading…</p>
  if (error) return <p className="state-err">{error}</p>
  return <>{children}</>
}

// ── Customer Detail ───────────────────────────────────────────────────────────

function CustomerContactRow({ company, accountCode, seq, existing, onSaved }: {
  company: string; accountCode: string; seq: 1 | 2
  existing?: { name?: string | null; role?: string | null; email?: string | null; telephone?: string | null }
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [cf, setCf] = useState({ name: "", role: "", email: "", telephone: "" })
  const [msg, setMsg] = useState<string | null>(null)
  function startEdit() {
    setCf({ name: existing?.name || "", role: existing?.role || "", email: existing?.email || "", telephone: existing?.telephone || "" })
    setEditing(true)
  }
  return (
    <div style={{ marginBottom: "0.4rem", padding: "0.4rem 0.6rem", border: "1px solid var(--color-border,#ddd)", borderRadius: "4px", fontSize: "0.85rem" }}>
      <strong>Contact {seq}</strong>
      {!editing ? (
        <span style={{ marginLeft: "0.75rem" }}>
          {existing?.name || "—"}
          {existing?.role && ` (${existing.role})`}
          {existing?.email && ` · ${existing.email}`}
          {existing?.telephone && ` · ${existing.telephone}`}
          <button className="link-btn" style={{ marginLeft: "0.5rem" }} onClick={startEdit}>Edit</button>
        </span>
      ) : (
        <span style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap", marginLeft: "0.5rem" }}>
          <input placeholder="Name" value={cf.name} onChange={e => setCf(f => ({ ...f, name: e.target.value }))} style={{ width: "9em" }} />
          <input placeholder="Role" value={cf.role} onChange={e => setCf(f => ({ ...f, role: e.target.value }))} style={{ width: "7em" }} />
          <input placeholder="Email" value={cf.email} onChange={e => setCf(f => ({ ...f, email: e.target.value }))} style={{ width: "12em" }} />
          <input placeholder="Phone" value={cf.telephone} onChange={e => setCf(f => ({ ...f, telephone: e.target.value }))} style={{ width: "8em" }} />
          <button className="action-btn" onClick={async () => {
            try { await api.customers.updateContact(company, accountCode, seq, cf); setEditing(false); onSaved() }
            catch (e) { setMsg(String(e)) }
          }}>Save</button>
          <button onClick={() => setEditing(false)}>Cancel</button>
          {msg && <span style={{ color: "var(--fail,#c00)" }}>{msg}</span>}
        </span>
      )}
    </div>
  )
}

export function CustomerDetail({ company, id }: { company: string; id: string }) {
  const [cRev, setCRev] = useState(0)
  const [editCredit, setEditCredit] = useState(false)
  const [cLimit, setCLimit] = useState("")
  const [cHold, setCHold] = useState<"" | "hold" | "super">("")
  const [cReason, setCReason] = useState("")
  const [cTerms, setCTerms] = useState("")
  const [cDays, setCDays] = useState("")
  const [cNotes, setCNotes] = useState("")
  const [cAccRef, setCAccRef] = useState("")
  const [cBusy, setCBusy] = useState(false)
  const [cMsg, setCMsg] = useState<string | null>(null)
  const { data: c, loading, error } = useData<CustomerDetail>(
    () => api.customers.get(company, id), [company, id, cRev]
  )
  async function saveCredit() {
    if (!c) return
    const body: Parameters<typeof api.customers.patchCredit>[2] = {}
    if (cLimit !== "") body.credit_limit_gbp = parseFloat(cLimit)
    if (cHold === "hold") { body.on_hold = true; body.on_super_hold = false }
    else if (cHold === "super") { body.on_hold = true; body.on_super_hold = true }
    else if (cHold === "") { body.on_hold = false; body.on_super_hold = false }
    if (cReason !== "") body.hold_reason = cReason
    if (cTerms !== "") body.terms = cTerms
    if (cDays !== "") body.payment_due_days = parseInt(cDays)
    if (cNotes !== "") body.notes = cNotes
    if (cAccRef !== "") body.accounting_ref = cAccRef
    if (!Object.keys(body).length) { setCMsg("No changes"); return }
    setCBusy(true); setCMsg(null)
    try {
      await api.customers.patchCredit(company, c.account_code, body)
      setEditCredit(false); setCRev(r => r + 1)
      setCLimit(""); setCReason(""); setCTerms(""); setCDays(""); setCHold(""); setCNotes(""); setCAccRef("")
    } catch (e) { setCMsg(String(e)) } finally { setCBusy(false) }
  }

  const { data: tStatus } = useData(
    () => api.terms.customerStatus(company, id), [company, id]
  )
  const { data: custOrders } = useData<SalesOrder[]>(
    () => api.sales.listOrders(company, 10, 0, id), [company, id]
  )
  const { data: custInvoices } = useData<Invoice[]>(
    () => api.sales.listInvoices(company, 10, 0, id), [company, id]
  )
  const { data: custPayments } = useData(
    () => api.finance.listPayments(company, { customerAccount: id, limit: 10 }), [company, id]
  )
  const [riskRev, setRiskRev] = useState(0)
  const { data: riskData } = useData(
    () => api.customers.riskScore(company, id), [company, id, riskRev]
  )
  const [recalcBusy, setRecalcBusy] = useState(false)
  async function recalcRisk() {
    setRecalcBusy(true)
    try { await api.customers.recalculateRiskScore(company, id); setRiskRev(r => r + 1); setCRev(r => r + 1) }
    finally { setRecalcBusy(false) }
  }
  return (
    <DetailShell loading={loading} error={error}>
      {c && <>
        <a href={`#/${company}/customers`} className="back-link">← Customers</a>
        <div className="detail-grid">
          <div className="detail-card">
            <h3>Contact</h3>
            <dl>
              <dt>Phone</dt><dd>{c.telephone || "—"}</dd>
              <dt>Fax</dt><dd>{c.fax || "—"}</dd>
              <dt>Email</dt><dd>{c.email || "—"}</dd>
              <dt>Website</dt><dd>{c.website || "—"}</dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Address</h3>
            <dl>
              {[c.address_line_1, c.address_line_2, c.address_line_3, c.address_line_4].filter(Boolean).map((l, i) => (
                [<dt key={`k${i}`}>{i === 0 ? "Address" : ""}</dt>, <dd key={`v${i}`}>{l}</dd>]
              ))}
              <dt>Postcode</dt><dd>{c.postcode || "—"}</dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Financials {riskData && (
              <span className={`risk-badge risk-${riskData.band}`} title={`Credit risk score: ${riskData.score}/100`}>
                Risk {riskData.score}
              </span>
            )}</h3>
            <dl>
              <dt>Credit Limit</dt><dd>{fmtGbp(c.credit_limit_gbp)}</dd>
              <dt>Balance</dt><dd>{fmtGbp(c.current_balance_gbp)}</dd>
              <dt>SO Balance</dt><dd>{fmtGbp(c.sales_order_balance_gbp)}</dd>
              <dt>Invoice Balance</dt><dd>{fmtGbp(c.invoice_balance_gbp)}</dd>
              <dt>Sales MTD</dt><dd>{fmtGbp(c.sales_mtd_gbp)}</dd>
              <dt>Sales YTD</dt><dd>{fmtGbp(c.sales_ytd_gbp)}</dd>
              <dt>Sales Last Year</dt><dd>{fmtGbp(c.sales_last_year_gbp)}</dd>
            </dl>
            {riskData && (
              <details className="risk-detail">
                <summary>Risk factors <button className="link-btn" onClick={e => { e.preventDefault(); recalcRisk() }} disabled={recalcBusy}>{recalcBusy ? "…" : "Recalculate"}</button></summary>
                <ul className="risk-factors">
                  {Object.entries(riskData.factors).map(([k, v]) => (
                    <li key={k}><code>{k}</code>: {String(v)}</li>
                  ))}
                  {Object.keys(riskData.factors).length === 0 && <li>No risk factors</li>}
                </ul>
              </details>
            )}
          </div>
          <div className="detail-card">
            <h3>Account <button className="link-btn" onClick={() => { setEditCredit(p => !p); setCMsg(null) }}>{editCredit ? "cancel" : "edit"}</button></h3>
            {editCredit ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.85rem" }}>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ width: "8rem" }}>Hold status</span>
                  <select value={cHold} onChange={e => setCHold(e.target.value as "" | "hold" | "super")}>
                    <option value="">Active</option>
                    <option value="hold">Hold</option>
                    <option value="super">Super Hold</option>
                  </select>
                </label>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ width: "8rem" }}>Hold reason</span>
                  <input value={cReason} onChange={e => setCReason(e.target.value)} placeholder={c.hold_reason || "—"} style={{ width: "12rem" }} />
                </label>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ width: "8rem" }}>Credit limit £</span>
                  <input type="number" step="0.01" value={cLimit} onChange={e => setCLimit(e.target.value)} placeholder={String(c.credit_limit_gbp ?? "")} style={{ width: "8rem" }} />
                </label>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ width: "8rem" }}>Pay terms</span>
                  <input value={cTerms} onChange={e => setCTerms(e.target.value)} placeholder={c.terms || "—"} style={{ width: "8rem" }} />
                </label>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ width: "8rem" }}>Pay days</span>
                  <input type="number" value={cDays} onChange={e => setCDays(e.target.value)} placeholder={String(c.payment_due_days ?? "")} style={{ width: "5rem" }} />
                </label>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                  <span style={{ width: "8rem", paddingTop: "0.2rem" }}>Notes</span>
                  <textarea value={cNotes} onChange={e => setCNotes(e.target.value)} placeholder={c.notes || "—"} style={{ width: "14rem", height: "4rem", resize: "vertical" }} />
                </label>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span style={{ width: "8rem" }}>Accounting ref</span>
                  <input value={cAccRef} onChange={e => setCAccRef(e.target.value)} placeholder={c.accounting_ref || "—"} style={{ width: "10rem" }} />
                </label>
                <button className="action-btn" onClick={saveCredit} disabled={cBusy} style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}>
                  {cBusy ? "Saving…" : "Save"}
                </button>
                {cMsg && <p style={{ fontSize: "0.8rem" }}>{cMsg}</p>}
              </div>
            ) : (
            <dl>
              <dt>Code</dt><dd><code>{c.account_code}</code></dd>
              <dt>Status</dt><dd><Badge value={c.on_hold ? (c.on_super_hold ? "Super Hold" : "Hold") : "Active"} /></dd>
              {c.hold_reason && [<dt key="hr-k">Hold Reason</dt>, <dd key="hr-v">{c.hold_reason}</dd>]}
              <dt>Terms</dt><dd>{c.terms || "—"}</dd>
              <dt>Pay Days</dt><dd>{c.payment_due_days ?? "—"}</dd>
              <dt>VAT Code</dt><dd>{c.vat_code || "—"}</dd>
              <dt>Currency</dt><dd>{c.currency || "—"}</dd>
              <dt>Price Band</dt><dd>{c.price_band || "—"}</dd>
              <dt>Opened</dt><dd>{fmtDate(c.account_opened)}</dd>
              {c.accounting_ref && [<dt key="ar-k">Accounting ref</dt>, <dd key="ar-v">{c.accounting_ref}</dd>]}
              {tStatus?.current_terms && <>
                <dt>Sale T&Cs</dt><dd>
                  {tStatus.accepted
                    ? <span className="badge badge--pass">Accepted v{tStatus.current_terms.version} · {fmtDate(tStatus.latest_acceptance?.accepted_at?.slice(0,10))}</span>
                    : <span className="badge badge--fail">Not accepted — <a href={`#/${company}/terms`}>v{tStatus.current_terms.version} pending</a></span>}
                </dd>
              </>}
            </dl>
            )}
          </div>
        </div>
        <div style={{ marginTop: "1.25rem" }}>
          <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.5rem" }}>Named contacts</h3>
          {([1, 2] as const).map(seq => (
            <CustomerContactRow key={seq} company={company} accountCode={c.account_code}
              seq={seq} existing={c.contacts?.find(ct => ct.seq === seq)}
              onSaved={() => setCRev(r => r + 1)} />
          ))}
        </div>
        {c.notes && (
          <section style={{ marginTop: "1.25rem", background: "var(--color-card-bg, #f9f9f9)", padding: "0.75rem 1rem", borderRadius: "4px", fontSize: "0.9rem" }}>
            <strong>Notes:</strong> {c.notes}
          </section>
        )}
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <a href={`#/${company}/statement/${encodeURIComponent(c.account_code)}`} className="action-btn" style={{ display: "inline-block", textDecoration: "none" }}>Account Statement</a>
          <RiskScoreBadge company={company} account={c.account_code} />
        </div>
        {custOrders && custOrders.length > 0 && (
          <section style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Recent Orders</h3>
            <table className="data-table">
              <thead><tr><th>Order</th><th>Date</th><th>Delivery</th><th>Ref</th><th>Status</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {custOrders.map(o => (
                  <tr key={o.order_no}>
                    <td><a href={`#/${company}/sales-orders/${o.order_no}`}>{o.order_no}</a></td>
                    <td>{fmtDate(o.order_date)}</td>
                    <td>{fmtDate(o.delivery_date)}</td>
                    <td>{o.customer_ref || "—"}</td>
                    <td><Badge value={o.status ?? ""} /></td>
                    <td style={{ textAlign: "right" }}>{fmtGbp(o.total_gbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {custInvoices && custInvoices.length > 0 && (
          <section style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Recent Invoices</h3>
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {custInvoices.map(i => (
                  <tr key={i.doc_no}>
                    <td><a href={`#/${company}/invoices/${i.doc_no}`}>{i.doc_no}</a></td>
                    <td>{fmtDate(i.invoice_date)}</td>
                    <td><Badge value={i.status ?? "—"} /></td>
                    <td style={{ textAlign: "right" }}>{fmtGbp(i.total_gbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {custPayments && custPayments.length > 0 && (
          <section style={{ marginTop: "1.5rem" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Recent Payments</h3>
            <table className="data-table">
              <thead><tr><th>Payment</th><th>Date</th><th>Method</th><th>Ref</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
              <tbody>
                {custPayments.map(p => (
                  <tr key={p.payment_no}>
                    <td><code>{p.payment_no}</code></td>
                    <td>{p.created_at?.slice(0, 10)}</td>
                    <td>{p.method || "—"}</td>
                    <td>{p.reference || "—"}</td>
                    <td style={{ textAlign: "right" }}>{fmtGbp(p.amount_gbp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </>}
    </DetailShell>
  )
}

// ── Sales Order Detail ────────────────────────────────────────────────────────

function RiskScoreBadge({ company, account }: { company: string; account: string }) {
  const { data } = useData(() => api.customers.riskScore(company, account), [company, account])
  if (!data) return null
  const colours: Record<string, string> = { green: "#15803d", amber: "#a06000", red: "#b91c1c" }
  const col = colours[data.band] ?? "#374151"
  return (
    <details style={{ display: "inline-block", fontSize: "0.82rem" }}>
      <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <span style={{ fontWeight: 700, color: col }}>Risk: {data.score}/100</span>
        <span className="badge" style={{ background: col, color: "#fff", fontSize: "0.68rem" }}>{data.band}</span>
      </summary>
      <div style={{ marginTop: "0.3rem", fontSize: "0.78rem", lineHeight: 1.7 }}>
        {Object.entries(data.factors).map(([k, v]) => (
          <div key={k}><code>{k.replace(/_/g, " ")}</code>: {String(v)}</div>
        ))}
        {Object.keys(data.factors).length === 0 && <div style={{ color: "var(--color-text-muted,#888)" }}>No risk factors.</div>}
      </div>
    </details>
  )
}

function RemnantPanel({ company, stockCode, cutLengthMm, sawTypeId }: {
  company: string; stockCode: string; cutLengthMm: number; sawTypeId?: number
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.batches.remnantRecommendations>> | null>(null)
  async function load() {
    if (result) return
    setLoading(true)
    try { setResult(await api.batches.remnantRecommendations(company, stockCode, cutLengthMm, sawTypeId)) }
    catch { /* ignore */ }
    finally { setLoading(false) }
  }
  return (
    <details style={{ fontSize: "0.75rem", marginTop: "0.2rem" }} onToggle={e => { if ((e.target as HTMLDetailsElement).open) { setOpen(true); load() } else setOpen(false) }}>
      <summary style={{ cursor: "pointer", color: "var(--brand,#0e7490)" }}>remnant options</summary>
      {open && (
        <div style={{ paddingTop: "0.3rem" }}>
          {loading && <span style={{ color: "var(--color-text-muted,#888)" }}>Checking…</span>}
          {result && result.recommendations.length === 0 && <span style={{ color: "var(--color-text-muted,#888)" }}>No suitable remnants available (need ≥{result.min_length_mm.toFixed(0)}mm).</span>}
          {result && result.recommendations.map(r => (
            <div key={r.batch_no} style={{ marginBottom: "0.4rem", padding: "0.3rem 0.4rem", background: "var(--surface-alt,#f3f4f6)", borderRadius: "4px" }}>
              <strong><a href={`#/${company}/batches/${encodeURIComponent(r.batch_no)}`}>{r.batch_no}</a></strong>
              {r.same_heat && <span className="badge" style={{ marginLeft: "0.3rem", fontSize: "0.65rem" }}>same heat</span>}
              {" · "}{r.length_mm}mm · tail {r.tail_offcut_mm.toFixed(0)}mm · waste {r.waste_pct}%
              {r.warehouse && <span style={{ color: "var(--color-text-muted,#888)" }}> · {r.warehouse}</span>}
            </div>
          ))}
        </div>
      )}
    </details>
  )
}

export function SalesOrderDetail({ company, id }: { company: string; id: string }) {
  const [rev, setRev] = useState(0)
  const [cancelMsg, setCancelMsg] = useState<string | null>(null)
  const { data: o, loading, error } = useData<SalesOrderDetail>(
    () => api.sales.getOrder(company, id), [company, id, rev]
  )

  async function cancelOrder() {
    if (!o || !confirm(`Cancel order ${o.order_no}? This will release all allocations.`)) return
    try {
      const r = await api.sales.cancelOrder(company, o.order_no)
      setCancelMsg(`Cancelled — ${r.allocations_released} allocation(s) released`); setRev(v => v + 1)
    } catch (e) { setCancelMsg(String(e)) }
  }

  return (
    <DetailShell loading={loading} error={error}>
      {o && <>
        <a href={`#/${company}/sales-orders`} className="back-link">← Sales Orders</a>
        <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button className="action-btn" onClick={async () => { try { window.open(await api.sales.pdf(company, o.order_no), "_blank") } catch (e) { alert(String(e)) } }}>PDF</button>
          {o.status === "confirmed" && <button className="action-btn" onClick={async () => { try { const r = await api.soWizard.ackPdfUrl(company, o.order_no); window.open(r.url, "_blank") } catch (e) { alert(String(e)) } }}>Ack PDF</button>}
          {o.status != null && ["open","confirmed"].includes(o.status) && <>
            <button onClick={cancelOrder}>Cancel order</button>
            {cancelMsg && <span className="badge">{cancelMsg}</span>}
          </>}
        </div>
        <div className="detail-grid">
          <div className="detail-card">
            <h3>Order</h3>
            <dl>
              <dt>Order No</dt><dd><code>{o.order_no}</code></dd>
              <dt>Customer</dt><dd>
                <a href={`#/${company}/customers/${encodeURIComponent(o.customer_account)}`}>
                  {o.customer_name || o.customer_account}
                </a>
              </dd>
              <dt>Ref</dt><dd>{o.customer_ref || "—"}</dd>
              <dt>Order Date</dt><dd>{fmtDate(o.order_date_serial)}</dd>
              <dt>Delivery</dt><dd>{fmtDate(o.delivery_date_serial)}</dd>
              <dt>Status</dt><dd><DerivedStatusBadge status={o.derived_status} /></dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Amounts</h3>
            <dl>
              <dt>Net</dt><dd>{pence(o.net_amount)}</dd>
              <dt>VAT</dt><dd>{pence(o.vat)}</dd>
              <dt>Total</dt><dd>{pence(o.total_amount)}</dd>
            </dl>
            {o.order_notes && <p style={{fontSize:".85rem", marginTop:".5rem"}}>{o.order_notes}</p>}
          </div>
          {(o.carriage_method || o.delivery_address_line_1 || o.delivery_postcode) && (
            <div className="detail-card">
              <h3>Delivery</h3>
              <dl>
                {o.carriage_method && <><dt>Carriage</dt><dd>{o.carriage_method}</dd></>}
                {(o.delivery_address_line_1 || o.delivery_postcode) && <>
                  <dt>Address</dt>
                  <dd>
                    {[o.delivery_address_line_1, o.delivery_address_line_2, o.delivery_address_line_3, o.delivery_address_line_4, o.delivery_postcode]
                      .filter(Boolean).join(", ")}
                  </dd>
                </>}
              </dl>
            </div>
          )}
        </div>
        {o.lines.length > 0 && (
          <div className="detail-lines">
            <h3>Lines</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Stock Code</th><th>Description</th>
                  <th className="r">Ordered</th><th className="r">Sent</th>
                  <th>Unit</th><th className="r">Total</th><th>Status</th><th>Delivery</th><th></th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l: SalesOrderLine) => (
                  <tr key={l.line_no}>
                    <td>{l.line_no}</td>
                    <td>{l.stock_account_code
                      ? <a href={`#/${company}/stock/${encodeURIComponent(l.stock_account_code)}`}><code>{l.stock_account_code}</code></a>
                      : "—"}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                        {l.short_description || "—"}
                        {l.is_cut_piece && <span className="badge" style={{ fontSize: "0.68rem" }}>cut {l.cut_length_mm}mm</span>}
                        {l.is_cut_piece && l.price_is_override && <span className="badge" style={{ fontSize: "0.68rem", color: "var(--color-warn,#a06000)" }}>price override</span>}
                      </div>
                      {l.line_notes && <small style={{display:"block",color:"var(--color-text-muted,#888)"}}>{l.line_notes}</small>}
                      {l.is_cut_piece && l.stock_account_code && l.cut_length_mm && (
                        <RemnantPanel company={company} stockCode={l.stock_account_code} cutLengthMm={l.cut_length_mm} sawTypeId={l.saw_type_id ?? undefined} />
                      )}
                      {l.is_cut_piece && l.cut_price_breakdown && (
                        <details style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>
                          <summary style={{ cursor: "pointer", color: "var(--color-text-muted,#888)" }}>price breakdown</summary>
                          <div style={{ paddingTop: "0.2rem", lineHeight: 1.6 }}>
                            {l.cut_price_breakdown.chargeable_length_mm}mm chargeable ·{" "}
                            {l.cut_price_breakdown.chargeable_weight_kg.toFixed(4)}kg ·{" "}
                            mat £{l.cut_price_breakdown.material_cost_per_piece.toFixed(4)} +{" "}
                            saw £{l.cut_price_breakdown.sawing_cost_per_piece.toFixed(2)} ·{" "}
                            cost £{l.cut_price_breakdown.cost_per_piece.toFixed(4)} ·{" "}
                            <strong>£{l.cut_price_breakdown.price_per_piece.toFixed(2)}/ea</strong>
                            {l.cut_price_breakdown.short_cut_flag && <span style={{ color: "var(--color-warn,#a06000)", marginLeft: "0.4rem" }}>⚠ short cut</span>}
                          </div>
                        </details>
                      )}
                    </td>
                    <td className="r">{l.qty_ordered ?? "—"}</td>
                    <td className="r">{l.qty_sent ?? "—"}</td>
                    <td>{l.unit_ordered_display || (l.price_unit ? `per ${l.price_unit.toLowerCase()}` : "—")}</td>
                    <td className="r">{fmtGbp(l.line_total_gbp)}</td>
                    <td><Badge value={l.status} /></td>
                    <td>{fmtDate(l.delivery_date)}</td>
                    <td><B2BButton company={company} orderNo={o.order_no} lineNo={l.line_no} existingPo={l.back_to_back_po_no} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {o.delivery_notes.length > 0 && (
          <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
            <h3>Deliveries</h3>
            <table>
              <thead><tr><th>Doc No</th><th>Date</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {o.delivery_notes.map(dn => (
                  <tr key={dn.doc_no}>
                    <td><a href={`#/${company}/delivery-notes/${encodeURIComponent(dn.doc_no)}`}><code>{dn.doc_no}</code></a></td>
                    <td>{dn.doc_date}</td>
                    <td>{dn.despatch_status}</td>
                    <td>{!dn.invoiced && dn.despatch_status !== "voided" && (
                      <button onClick={async () => {
                        const reason = window.prompt("Void reason:")
                        if (!reason?.trim()) return
                        try {
                          await api.despatchChecks.voidDn(company, dn.doc_no, reason.trim())
                          setRev(r => r + 1)
                        } catch (e: unknown) {
                          alert(e instanceof Error ? e.message : "Void failed")
                        }
                      }}>Void DN</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {o.invoices.length > 0 && (
          <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
            <h3>Invoices</h3>
            <table>
              <thead><tr><th>Doc No</th><th>Date</th><th className="r">Total</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {o.invoices.map(inv => (
                  <tr key={inv.doc_no}>
                    <td><a href={`#/${company}/invoices/${encodeURIComponent(inv.doc_no)}`}><code>{inv.doc_no}</code></a></td>
                    <td>{inv.invoice_date_serial}</td>
                    <td className="r">£{(inv.total_amount / 100).toFixed(2)}</td>
                    <td>{inv.status}</td>
                    <td>
                      {inv.status === "issued" && !inv.posted && (
                        <button onClick={async () => {
                          if (!window.confirm(`Void invoice ${inv.doc_no}?`)) return
                          try {
                            await api.sales.voidInvoice(company, inv.doc_no)
                            setRev(r => r + 1)
                          } catch (e: unknown) {
                            alert(e instanceof Error ? e.message : "Void failed")
                          }
                        }}>Void</button>
                      )}
                      {inv.posted && (
                        <a href={`#/${company}/invoices/${encodeURIComponent(inv.doc_no)}`}>Credit note</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AllocationSection company={company} order={o} />
        <DespatchReadiness company={company} orderNo={o.order_no} />
        <DespatchSection company={company} order={o} />
      </>}
    </DetailShell>
  )
}

function DespatchReadiness({ company, orderNo }: { company: string; orderNo: string }) {
  const [lines, setLines] = useState<ReadinessLine[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function run() {
    setBusy(true); setErr(null)
    try { setLines((await api.despatchChecks.readiness(company, orderNo)).lines) }
    catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="detail-card">
      <h3>Despatch readiness</h3>
      <button className="action-btn" disabled={busy} onClick={run}>{busy ? "Checking…" : "Run readiness check"}</button>
      {err && <div className="gate-msg gate-msg--block">{err}</div>}
      {lines?.map(l => (
        <div key={l.line_no} style={{ marginTop: ".5rem" }}>
          <strong>Line {l.line_no}</strong> {l.summary.overall_pass ? "✅" : "❌"}
          {l.findings.map((f, i) => <div key={i} className={`gate-msg gate-msg--${f.level}`}>{f.message}</div>)}
        </div>
      ))}
    </div>
  )
}

function AllocationSection({ company, order }: { company: string; order: SalesOrderDetail }) {
  const [allocs, setAllocs] = useState<Allocation[]>([])
  const [form, setForm] = useState({ line_no: order.lines[0]?.line_no ?? 1, batch_no: "", qty: "", override_cert: false })
  const [msg, setMsg] = useState<string | null>(null)
  const reload = useCallback(() => {
    api.sales.listAllocations(company, order.order_no).then(setAllocs).catch(console.error)
  }, [company, order.order_no])
  useEffect(() => { reload() }, [reload])

  // Available batches for the selected line's stock item — the picker the salesperson chooses from.
  const selectedCode = order.lines.find(l => l.line_no === Number(form.line_no))?.stock_account_code || ""
  const { data: batchData } = useData(
    () => selectedCode ? api.stock.batches(company, selectedCode) : Promise.resolve(null),
    [company, selectedCode])
  const available = (batchData?.batches ?? []).filter(b => Number(b.qty_available) > 0)

  async function allocate() {
    const qty = parseFloat(form.qty)
    if (!form.batch_no.trim() || !qty || qty <= 0) { setMsg("Enter a batch and a positive qty"); return }
    try {
      const r = await api.sales.allocate(company, order.order_no, {
        line_no: Number(form.line_no), batch_no: form.batch_no.trim(), qty, override_cert: form.override_cert,
      })
      setMsg(r.cert_ok ? `Allocated ${r.batch_no}` : `Allocated ${r.batch_no} — cert override: ${r.cert_note}`)
      setForm({ ...form, batch_no: "", qty: "" }); reload()
    } catch (e) { setMsg(String(e)) }
  }

  return (
    <div className="detail-lines">
      <h3>Stock allocation</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.75rem" }}>
        <select value={form.line_no} onChange={e => setForm({ ...form, line_no: Number(e.target.value) })}>
          {order.lines.map(l => (
            <option key={l.line_no} value={l.line_no}>Line {l.line_no} — {l.stock_account_code || l.short_description || ""}</option>
          ))}
        </select>
        <input placeholder="Batch no" value={form.batch_no} onChange={e => setForm({ ...form, batch_no: e.target.value })} />
        <input type="number" placeholder="Qty" step="any" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} />
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={form.override_cert} onChange={e => setForm({ ...form, override_cert: e.target.checked })} /> Override cert
          <Tip text="Allocate a batch even if its certificate type is below the customer's required EN 10204 grade. Recorded against you." />
        </label>
        <button className="action-btn" onClick={allocate}>Allocate</button>
        {msg && <span className="badge">{msg}</span>}
      </div>
      {selectedCode && (
        <div style={{ marginBottom: "0.75rem" }}>
          <h4 style={{ margin: "0 0 0.3rem" }}>Available batches — {selectedCode}</h4>
          {available.length === 0 ? <p className="state-msg">No available batches for this item.</p> : (
            <table>
              <thead><tr><th>Batch</th><th>Heat</th><th>Cert</th><th>Grade</th>
                <th className="r">Available</th><th>Location</th><th></th></tr></thead>
              <tbody>
                {available.map(b => (
                  <tr key={b.batch_no} style={form.batch_no === b.batch_no ? { background: "var(--row-selected, #eef)" } : undefined}>
                    <td>{b.batch_no}</td><td>{b.heat_no || "—"}</td><td>{b.cert_ref || "—"}</td><td>{b.grade || "—"}</td>
                    <td className="r">{b.qty_available} {b.unit}</td><td>{b.warehouse || "—"}</td>
                    <td><button onClick={() => setForm({ ...form, batch_no: b.batch_no })}>Pick</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {allocs.length > 0 && (
        <table>
          <thead><tr><th>Line</th><th>Batch</th><th>Heat</th><th>Grade</th><th className="r">Qty</th><th>Cert</th><th>Status</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {allocs.map(a => (
              <tr key={a.id}>
                <td>{a.line_no}</td>
                <td><a href={`#/${company}/batches/${a.batch_no}`}>{a.batch_no}</a></td>
                <td>{a.heat_no}</td><td>{a.grade}</td>
                <td className="r">{a.qty}</td>
                <td>{a.cert_ok === false
                  ? <span className="badge badge--fail" title={a.cert_note || ""}>override</span>
                  : a.cert_ok ? <span className="badge badge--pass">OK</span> : "—"}</td>
                <td><Badge value={a.status} /></td>
                <td>
                  {a.allocation_type === "hard"
                    ? <span className="badge badge--pass" title="Batch reserved for this order">hard</span>
                    : <span className="badge" style={{ background: "var(--color-bg-subtle,#e8e8e8)" }}>soft</span>}
                </td>
                <td style={{ display: "flex", gap: "0.25rem" }}>
                  {a.status !== "despatched" && a.allocation_type !== "hard" && (
                    <button style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", color: "var(--color-pass,#0a0)" }}
                      onClick={async () => {
                        try { await api.sales.hardenAllocation(company, order.order_no, a.id); reload() }
                        catch (e) { setMsg(String(e)) }
                      }}>Reserve</button>
                  )}
                  {a.status !== "despatched" && a.allocation_type !== "hard" && (
                    <button style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem", color: "var(--color-fail,#c00)" }}
                      onClick={async () => {
                        if (!confirm(`Remove allocation of ${a.qty} × ${a.batch_no}?`)) return
                        try { await api.sales.deallocate(company, order.order_no, a.id); reload() }
                        catch (e) { setMsg(String(e)) }
                      }}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function B2BButton({ company, orderNo, lineNo, existingPo }: { company: string; orderNo: string; lineNo: number; existingPo?: string | null }) {
  const [po, setPo] = useState<string | null>(existingPo ?? null)
  const [err, setErr] = useState<string | null>(null)
  async function go() {
    const supplier = window.prompt("Supplier account for the back-to-back PO (blank = unassigned):") || undefined
    try { const r = await api.finance.backToBack(company, orderNo, lineNo, supplier); setPo(r.po_no) }
    catch (e) { setErr(String(e)) }
  }
  if (po) return <a href={`#/${company}/purchase-orders/${encodeURIComponent(po)}`}>{po}</a>
  return <button onClick={go} aria-label={err || "Raise a back-to-back purchase order"} title={err || "Raise a back-to-back PO"}>B2B PO</button>
}

// ── Invoice Detail ────────────────────────────────────────────────────────────

export function InvoiceDetail({ company, id }: { company: string; id: string }) {
  const { data: inv, loading, error } = useData<InvoiceDetail>(
    () => api.sales.getInvoice(company, id), [company, id]
  )
  const [rev, setRev] = useState(0)
  const { data: creditNotes } = useData(
    () => api.finance.listCreditNotes(company, id), [company, id, rev]
  )
  const { data: invPayments } = useData(
    () => api.finance.listPayments(company, { invoiceNo: id }), [company, id, rev]
  )
  const [msg, setMsg] = useState<string | null>(null)
  const [payAmt, setPayAmt] = useState("")
  const [payMethod, setPayMethod] = useState("bank_transfer")
  const [payRef, setPayRef] = useState("")
  const [showPayForm, setShowPayForm] = useState(false)
  const [showCnForm, setShowCnForm] = useState(false)
  const [cnReason, setCnReason] = useState("")

  async function creditNote() {
    try {
      const r = await api.finance.creditNote(company, id, cnReason.trim() || undefined)
      setMsg(`Raised ${r.credit_note_no}`)
      setRev(v => v + 1); setShowCnForm(false); setCnReason("")
    } catch (e) { setMsg(String(e)) }
  }

  async function recordPay() {
    if (!inv?.customer_account) return
    const amt = parseFloat(payAmt)
    if (!amt || amt <= 0) { setMsg("Enter a valid amount"); return }
    try {
      const r = await api.finance.recordPayment(company, {
        customer_account: inv.customer_account, amount_gbp: amt,
        method: payMethod, reference: payRef.trim() || undefined,
        allocations: [{ invoice_no: id, amount_gbp: amt }],
      })
      setMsg(`Payment ${r.payment_no} recorded`)
      setPayAmt(""); setPayRef(""); setShowPayForm(false)
    } catch (e) { setMsg(String(e)) }
  }

  return (
    <DetailShell loading={loading} error={error}>
      {inv && <>
        <a href={`#/${company}/invoices`} className="back-link">← Invoices</a>
        <div style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0", alignItems: "center", flexWrap: "wrap" }}>
          <button className="action-btn" onClick={async () => { try { window.open(await api.sales.invoicePdf(company, id), "_blank") } catch (e) { setMsg(String(e)) } }}>PDF</button>
          <button className="action-btn" onClick={() => setShowPayForm(v => !v)}>Record payment</button>
          <button className="action-btn" onClick={() => setShowCnForm(v => !v)}>Raise credit note</button>
          {!inv.posted && inv.status === "issued" && (
            <button className="action-btn" onClick={async () => { try { await api.sales.markPosted(company, id); setMsg("Marked as posted") } catch (e) { setMsg(String(e)) } }}>Mark posted</button>
          )}
          {msg && <span className="badge">{msg}</span>}
        </div>
        {showCnForm && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", padding: "0.75rem", background: "var(--bg-card, #f8f9fa)", borderRadius: "4px", marginBottom: "0.5rem" }}>
            <input value={cnReason} onChange={e => setCnReason(e.target.value)} placeholder="Reason (optional)" style={{ width: "18rem" }} />
            <button className="action-btn" onClick={creditNote}>Confirm credit note</button>
            <button aria-label="Cancel credit note" onClick={() => setShowCnForm(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </div>
        )}
        {showPayForm && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", padding: "0.75rem", background: "var(--bg-card, #f8f9fa)", borderRadius: "4px", marginBottom: "1rem" }}>
            <input type="number" value={payAmt} onChange={e => setPayAmt(e.target.value)}
              placeholder={`Amount £ (total ${fmtGbp(inv.total_amount_gbp)})`} style={{ width: "12rem" }} />
            <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
            <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Reference / BACS ref" style={{ width: "12rem" }} />
            <button className="action-btn" onClick={recordPay}>Save payment</button>
            <button aria-label="Cancel payment form" onClick={() => setShowPayForm(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>✕</button>
          </div>
        )}
        <div className="detail-grid">
          <div className="detail-card">
            <h3>Invoice</h3>
            <dl>
              <dt>Invoice No</dt><dd><code>{inv.doc_no}</code></dd>
              <dt>Customer</dt><dd>
                <a href={`#/${company}/customers/${encodeURIComponent(inv.customer_account)}`}>
                  {inv.customer_name || inv.customer_account}
                </a>
              </dd>
              {inv.sales_order_no && <>
                <dt>Sales order</dt><dd>
                  <a href={`#/${company}/sales-orders/${encodeURIComponent(inv.sales_order_no)}`}><code>{inv.sales_order_no}</code></a>
                </dd>
              </>}
              <dt>Date</dt><dd>{fmtDate(inv.invoice_date_serial)}</dd>
              <dt>Posted</dt><dd>{inv.posted ? "✓ Yes" : "No"}</dd>
              <dt>Terms</dt><dd>{inv.payment_terms || "—"}</dd>
              <dt>Currency</dt><dd>{inv.currency || "—"}</dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Amounts</h3>
            <dl>
              <dt>Net</dt><dd>{fmtGbp(inv.net_amount_gbp)}</dd>
              <dt>VAT</dt><dd>{fmtGbp(inv.vat_amount_gbp)}</dd>
              <dt>Total</dt><dd>{fmtGbp(inv.total_amount_gbp)}</dd>
              {inv.cost_amount_gbp != null && [<dt key="c-k">Cost</dt>, <dd key="c-v">{fmtGbp(inv.cost_amount_gbp)}</dd>]}
            </dl>
          </div>
          {(inv.weight_basis || inv.delivery_doc_no) && (
            <div className="detail-card">
              <h3>Catch-weight / source</h3>
              <dl>
                <dt>Weight basis</dt><dd>{inv.weight_basis || "—"}</dd>
                <dt>Theoretical</dt><dd>{inv.weight_theoretical_kg ? `${inv.weight_theoretical_kg} kg` : "—"}</dd>
                <dt>Actual</dt><dd>{inv.weight_actual_kg ? `${inv.weight_actual_kg} kg` : "—"}</dd>
                <dt>Variance</dt><dd>{inv.weight_variance_flag
                  ? <span className="badge badge--fail">&gt; 2%</span>
                  : <span className="badge badge--pass">within tol.</span>}</dd>
                <dt>Due</dt><dd>{fmtDate(inv.due_date_serial)}</dd>
                <dt>Despatch</dt><dd>{inv.delivery_doc_no
                  ? <a href={`#/${company}/delivery-notes/${inv.delivery_doc_no}`}>{inv.delivery_doc_no}</a> : "—"}</dd>
              </dl>
            </div>
          )}
        </div>
        {inv.lines && inv.lines.length > 0 && (
          <div className="detail-lines">
            <h3>Lines</h3>
            <table>
              <thead><tr>
                <th>#</th><th>Stock</th><th>Heat</th><th>Cert</th><th className="r">Qty</th>
                <th className="r">Billed kg</th><th className="r">Unit £</th><th className="r">Total</th><th>Variance</th>
              </tr></thead>
              <tbody>
                {inv.lines.map(l => (
                  <tr key={l.line_no}>
                    <td>{l.line_no}</td>
                    <td>{l.stock_account_code || "—"}</td>
                    <td>{l.heat_no || "—"}</td>
                    <td>{l.cert_ref || "—"}</td>
                    <td className="r">{l.qty ?? "—"}</td>
                    <td className="r">{l.weight_billed_kg ?? "—"}</td>
                    <td className="r">{fmtGbp(l.price_gbp)}</td>
                    <td className="r">{fmtGbp(l.line_total_gbp)}</td>
                    <td>{l.variance_flag ? <span className="badge badge--fail">!</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {creditNotes && creditNotes.length > 0 && (
          <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
            <h3>Credit Notes</h3>
            <table>
              <thead><tr><th>Credit Note</th><th>Reason</th><th className="r">Net</th><th className="r">Total</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {creditNotes.map(cn => (
                  <tr key={cn.credit_note_no}>
                    <td><code>{cn.credit_note_no}</code></td>
                    <td>{cn.reason || "—"}</td>
                    <td className="r">{fmtGbp(cn.net_gbp)}</td>
                    <td className="r">{fmtGbp(cn.total_gbp)}</td>
                    <td><Badge value={cn.status ?? "—"} /></td>
                    <td>{cn.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {invPayments && invPayments.length > 0 && (
          <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
            <h3>Payments allocated to this invoice</h3>
            <table>
              <thead><tr><th>Payment</th><th>Method</th><th>Reference</th><th className="r">Amount</th><th>Date</th></tr></thead>
              <tbody>
                {invPayments.map(p => (
                  <tr key={p.payment_no}>
                    <td><code>{p.payment_no}</code></td>
                    <td>{p.method || "—"}</td>
                    <td>{p.reference || "—"}</td>
                    <td className="r">{fmtGbp(p.amount_gbp)}</td>
                    <td>{p.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}
    </DetailShell>
  )
}

// ── New stock code ────────────────────────────────────────────────────────────

const ATTR_ROWS: [number, "attribute_1" | "attribute_2" | "attribute_3" | "attribute_4", string][] = [
  [1, "attribute_1", "Material"], [2, "attribute_2", "Section"],
  [3, "attribute_3", "Grade"], [4, "attribute_4", "Finish"],
]

export function CustomerNew({ company }: { company: string }) {
  const [form, setForm] = useState({
    account_code: "", name: "", address_line_1: "", address_line_2: "",
    address_line_3: "", address_line_4: "", postcode: "",
    telephone: "", fax: "", email: "", website: "", vat_number: "",
    currency: "GBP", payment_due_days: "", terms: "", notes: "",
  })
  const [busy, setBusy] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function extract() {
    if (!fileRef.current?.files?.length) return
    setExtracting(true); setMsg(null)
    try {
      const d = await api.customers.extract(company, Array.from(fileRef.current.files))
      setForm(p => ({
        ...p,
        account_code: d.account_code || p.account_code,
        name: d.name || p.name,
        address_line_1: d.address_line_1 || p.address_line_1,
        address_line_2: d.address_line_2 || p.address_line_2,
        address_line_3: d.address_line_3 || p.address_line_3,
        address_line_4: d.address_line_4 || p.address_line_4,
        postcode: d.postcode || p.postcode,
        telephone: d.telephone || p.telephone,
        fax: d.fax || p.fax,
        email: d.email || p.email,
        website: d.website || p.website,
        vat_number: d.vat_number || p.vat_number,
        currency: d.currency || p.currency,
        payment_due_days: d.payment_due_days != null ? String(d.payment_due_days) : p.payment_due_days,
        terms: d.terms || p.terms,
        notes: d.notes || p.notes,
      }))
      setMsg("AI extracted — review and confirm.")
    } catch (e) { setMsg(String(e)) } finally { setExtracting(false) }
  }

  async function save() {
    if (!form.account_code.trim() || !form.name.trim()) { setMsg("Code and name are required."); return }
    setBusy(true); setMsg(null)
    try {
      const body: Record<string, unknown> = { ...form, account_code: form.account_code.trim().toUpperCase() }
      if (form.payment_due_days) body.payment_due_days = Number(form.payment_due_days)
      const r = await api.customers.create(company, body)
      location.hash = `#/${company}/customers/${encodeURIComponent(r.account_code)}`
    } catch (e) { setMsg(String(e)); setBusy(false) }
  }

  return (
    <div className="grn-shell">
      <a href={`#/${company}/customers`} className="back-link">← Customers</a>
      <h2 className="grn-title">New customer</h2>
      <div className="grn-form">
        <div className="grn-section">
          <h3>Pre-fill from document</h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input ref={fileRef} type="file" accept=".pdf,image/*" multiple style={{ flex: 1 }} />
            <button className="action-btn" onClick={extract} disabled={extracting}>
              {extracting ? "Extracting…" : "Extract with AI"}
            </button>
          </div>
        </div>
        <div className="grn-section">
          <h3>Account</h3>
          <div className="grn-grid">
            <label className="grn-label">Code
              <input className="grn-input" value={form.account_code} onChange={e => set("account_code", e.target.value.toUpperCase())} /></label>
            <label className="grn-label">Name
              <input className="grn-input" value={form.name} onChange={e => set("name", e.target.value)} /></label>
            <label className="grn-label">VAT number
              <input className="grn-input" value={form.vat_number} onChange={e => set("vat_number", e.target.value)} /></label>
            <label className="grn-label">Currency
              <input className="grn-input" value={form.currency} onChange={e => set("currency", e.target.value.toUpperCase())} /></label>
          </div>
        </div>
        <div className="grn-section">
          <h3>Address</h3>
          <div className="grn-grid">
            <label className="grn-label">Address line 1
              <input className="grn-input" value={form.address_line_1} onChange={e => set("address_line_1", e.target.value)} /></label>
            <label className="grn-label">Address line 2
              <input className="grn-input" value={form.address_line_2} onChange={e => set("address_line_2", e.target.value)} /></label>
            <label className="grn-label">Address line 3
              <input className="grn-input" value={form.address_line_3} onChange={e => set("address_line_3", e.target.value)} /></label>
            <label className="grn-label">Town / City
              <input className="grn-input" value={form.address_line_4} onChange={e => set("address_line_4", e.target.value)} /></label>
            <label className="grn-label">Postcode
              <input className="grn-input" value={form.postcode} onChange={e => set("postcode", e.target.value.toUpperCase())} /></label>
          </div>
        </div>
        <div className="grn-section">
          <h3>Contact</h3>
          <div className="grn-grid">
            <label className="grn-label">Telephone
              <input className="grn-input" value={form.telephone} onChange={e => set("telephone", e.target.value)} /></label>
            <label className="grn-label">Fax
              <input className="grn-input" value={form.fax} onChange={e => set("fax", e.target.value)} /></label>
            <label className="grn-label">Email
              <input className="grn-input" type="email" value={form.email} onChange={e => set("email", e.target.value)} /></label>
            <label className="grn-label">Website
              <input className="grn-input" value={form.website} onChange={e => set("website", e.target.value)} /></label>
          </div>
        </div>
        <div className="grn-section">
          <h3>Terms</h3>
          <div className="grn-grid">
            <label className="grn-label">Payment days
              <input className="grn-input" type="number" value={form.payment_due_days} onChange={e => set("payment_due_days", e.target.value)} /></label>
            <label className="grn-label">Terms text
              <input className="grn-input" value={form.terms} onChange={e => set("terms", e.target.value)} /></label>
          </div>
        </div>
        <div className="grn-section">
          <h3>Notes</h3>
          <textarea className="grn-input" rows={3} style={{ width: "100%" }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </div>
        <div className="grn-actions">
          <button className="action-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Create customer"}</button>
          {msg && <span className={msg.startsWith("AI") ? "badge badge--ok" : "badge badge--fail"}>{msg}</span>}
        </div>
      </div>
    </div>
  )
}

export function StockNew({ company }: { company: string }) {
  const { bySlot } = useAttributes(company)
  const [f, setF] = useState<StockItemIn>({ account_code: "", stock_unit_1: "KG", price_basis: "KG", status: "A" })
  const [msg, setMsg] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof StockItemIn>(k: K, v: StockItemIn[K]) => setF(p => ({ ...p, [k]: v }))
  const num = (v: string) => (v ? Number(v) : undefined)

  async function extract() {
    if (!fileRef.current?.files?.length) return
    setExtracting(true); setMsg(null)
    try {
      const d = await api.stock.extract(company, Array.from(fileRef.current.files))
      setF(p => ({
        ...p,
        account_code: d.account_code || p.account_code,
        description_1: d.description_1 || p.description_1,
        short_description: d.short_description || p.short_description,
        attribute_1: d.attribute_1 || p.attribute_1,
        attribute_2: d.attribute_2 || p.attribute_2,
        attribute_3: d.attribute_3 || p.attribute_3,
        attribute_4: d.attribute_4 || p.attribute_4,
        size_1_mm: d.size_1_mm ?? p.size_1_mm,
        weight_per_metre: d.weight_per_metre ?? p.weight_per_metre,
        stock_unit_1: d.stock_unit_1 || p.stock_unit_1,
        price_basis: d.price_basis || p.price_basis,
      }))
      setMsg("AI extracted — review and confirm.")
    } catch (e) { setMsg(String(e)) } finally { setExtracting(false) }
  }

  async function save() {
    if (!f.account_code.trim()) { setMsg("Enter a stock code"); return }
    try {
      const r = await api.stock.create(company, { ...f, account_code: f.account_code.trim().toUpperCase() })
      window.location.hash = `#/${company}/stock/${encodeURIComponent(r.account_code)}`
    } catch (e) { setMsg(String(e)) }
  }

  return (
    <div className="grn-shell">
      <a href={`#/${company}/stock`} className="back-link">← Stock</a>
      <h2 className="grn-title">New stock code</h2>
      <div className="grn-form">
        <div className="grn-section">
          <h3>Pre-fill from document</h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input ref={fileRef} type="file" accept=".pdf,image/*" multiple style={{ flex: 1 }} />
            <button className="action-btn" onClick={extract} disabled={extracting}>
              {extracting ? "Extracting…" : "Extract with AI"}
            </button>
            {msg && <span className={msg.startsWith("AI") ? "badge badge--ok" : "badge badge--fail"}>{msg}</span>}
          </div>
        </div>
        <div className="grn-section">
          <h3>Identity</h3>
          <div className="grn-grid">
            <label className="grn-label">Stock code
              <input className="grn-input" value={f.account_code} onChange={e => set("account_code", e.target.value.toUpperCase())} /></label>
            <label className="grn-label">Description
              <input className="grn-input" value={f.description_1 ?? ""} onChange={e => set("description_1", e.target.value)} /></label>
            <label className="grn-label">Short description
              <input className="grn-input" value={f.short_description ?? ""} onChange={e => set("short_description", e.target.value)} /></label>
          </div>
        </div>
        <div className="grn-section">
          <h3>Attributes</h3>
          <div className="grn-grid">
            {ATTR_ROWS.map(([slot, key, lab]) => (
              <label className="grn-label" key={key}>{lab}
                <select className="grn-input" value={f[key] ?? ""} onChange={e => set(key, e.target.value || undefined)}>
                  <option value="">—</option>
                  {bySlot(slot).map(a => <option key={a.code} value={a.code}>{a.description || a.code}</option>)}
                </select>
              </label>
            ))}
            <label className="grn-label">Size (mm)
              <input className="grn-input" type="number" value={f.size_1_mm ?? ""} onChange={e => set("size_1_mm", num(e.target.value))} /></label>
          </div>
        </div>
        <div className="grn-section">
          <h3>Units &amp; weight</h3>
          <div className="grn-grid">
            <label className="grn-label">Price/stock unit
              <input className="grn-input" value={f.stock_unit_1 ?? "KG"} onChange={e => set("stock_unit_1", e.target.value.toUpperCase())} /></label>
            <label className="grn-label">Length unit
              <input className="grn-input" placeholder="M" value={f.stock_unit_2 ?? ""} onChange={e => set("stock_unit_2", e.target.value.toUpperCase() || undefined)} /></label>
            <label className="grn-label">Weight per metre (kg/m)
              <input className="grn-input" type="number" value={f.weight_per_metre ?? ""} onChange={e => set("weight_per_metre", num(e.target.value))} /></label>
          </div>
        </div>
        <div className="grn-section">
          <h3>Pricing (£ per {f.stock_unit_1 || "KG"})</h3>
          <div className="grn-grid">
            <label className="grn-label">Cost £
              <input className="grn-input" type="number" value={f.cost_price ?? ""} onChange={e => set("cost_price", num(e.target.value))} /></label>
            <label className="grn-label">List £
              <input className="grn-input" type="number" value={f.list_price ?? ""} onChange={e => set("list_price", num(e.target.value))} /></label>
            <label className="grn-label">Sell £
              <input className="grn-input" type="number" value={f.sell_price ?? ""} onChange={e => set("sell_price", num(e.target.value))} /></label>
            <label className="grn-label">Warehouse
              <input className="grn-input" value={f.warehouse ?? ""} onChange={e => set("warehouse", e.target.value)} /></label>
          </div>
        </div>
        <div className="grn-actions">
          <button className="action-btn" onClick={save}>Create stock code</button>
          {msg && <span className="badge badge--fail">{msg}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Stock Detail ──────────────────────────────────────────────────────────────

export function StockDetail({ company, id }: { company: string; id: string }) {
  const [txnRev, setTxnRev] = useState(0)
  const [adjQty, setAdjQty] = useState("")
  const [adjNotes, setAdjNotes] = useState("")
  const [adjRef, setAdjRef] = useState("")
  const [adjBusy, setAdjBusy] = useState(false)
  const [adjMsg, setAdjMsg] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState(false)
  const [pCost, setPCost] = useState("")
  const [pSell, setPSell] = useState("")
  const [pList, setPList] = useState("")
  const [pReorderLevel, setPReorderLevel] = useState("")
  const [pReorderQty, setPReorderQty] = useState("")
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceMsg, setPriceMsg] = useState<string | null>(null)
  const [rev, setRev] = useState(0)
  const { data: s, loading, error } = useData<StockItemDetail>(
    () => api.stock.get(company, id), [company, id, rev]
  )
  const { label } = useAttributes(company)
  const { data: txns } = useData(
    () => s ? api.stock.listTransactions(company, s.id) : Promise.resolve([]),
    [company, s?.id, txnRev]
  )
  const { data: purchaseHistory } = useData(
    () => s ? api.grn.list(company, "", s.account_code) : Promise.resolve([]),
    [company, s?.account_code]
  )
  const { data: despatchHistory } = useData(
    () => s ? api.dispatch.stockDespatchHistory(company, s.account_code) : Promise.resolve([]),
    [company, s?.account_code]
  )

  async function savePrices() {
    if (!s) return
    const body: Record<string, number> = {}
    if (pCost !== "") body.cost_price = parseFloat(pCost)
    if (pSell !== "") body.sell_price = parseFloat(pSell)
    if (pList !== "") body.list_price = parseFloat(pList)
    if (pReorderLevel !== "") body.reorder_level = parseFloat(pReorderLevel)
    if (pReorderQty !== "") body.reorder_qty = parseFloat(pReorderQty)
    if (!Object.keys(body).length) { setPriceMsg("No changes"); return }
    setPriceBusy(true); setPriceMsg(null)
    try {
      await api.stock.patch(company, s.account_code, body)
      setEditPrice(false); setRev(r => r + 1); setPriceMsg(null)
      setPCost(""); setPSell(""); setPList(""); setPReorderLevel(""); setPReorderQty("")
    } catch (e) { setPriceMsg(String(e)) } finally { setPriceBusy(false) }
  }

  async function recordAdj() {
    const q = parseFloat(adjQty)
    if (!q || q === 0) { setAdjMsg("Enter a non-zero quantity"); return }
    if (!s) return
    setAdjBusy(true); setAdjMsg(null)
    try {
      await api.stock.postTransaction(company, {
        txn_type: "adjustment", stock_item_id: s.id,
        qty: q, notes: adjNotes.trim() || undefined, ref_doc_no: adjRef.trim() || undefined,
      })
      setAdjQty(""); setAdjNotes(""); setAdjRef("")
      setTxnRev(r => r + 1)
      setAdjMsg("Adjustment recorded")
    } catch (e) { setAdjMsg(String(e)) } finally { setAdjBusy(false) }
  }
  return (
    <DetailShell loading={loading} error={error}>
      {s && <>
        <a href={`#/${company}/stock`} className="back-link">← Stock</a>
        <div className="detail-grid">
          <div className="detail-card">
            <h3>Identity</h3>
            <dl>
              <dt>Code</dt><dd><code>{s.account_code}</code></dd>
              <dt>Description</dt><dd>{s.description_1 || "—"}</dd>
              <dt>Short Desc</dt><dd>{s.short_description || "—"}</dd>
              <dt>Material</dt><dd>{label(1, s.attribute_1)}</dd>
              <dt>Section</dt><dd>{label(2, s.attribute_2)}</dd>
              <dt>Grade</dt><dd>{label(3, s.attribute_3)}</dd>
              <dt>Finish</dt><dd>{label(4, s.attribute_4)}</dd>
              <dt>Status</dt><dd>
                <Badge value={s.status} />
                {s.status === "A"
                  ? <button className="link-btn" style={{ marginLeft: "0.5rem" }}
                      onClick={async () => { await api.stock.patch(company, s.account_code, { status: "D" }); setRev(r => r + 1) }}>Deactivate</button>
                  : <button className="link-btn" style={{ marginLeft: "0.5rem" }}
                      onClick={async () => { await api.stock.patch(company, s.account_code, { status: "A" }); setRev(r => r + 1) }}>Activate</button>}
              </dd>
              <dt>Warehouse</dt><dd>{s.warehouse || "—"}</dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Stock Levels</h3>
            <dl>
              <dt>In Stock</dt><dd>{stk(s.stock_qty)} {s.stock_unit_1 || ""}</dd>
              <dt>On Order</dt><dd>{stk(s.po_qty)} {s.stock_unit_1 || ""}</dd>
              <dt>Free Stock</dt><dd>{stk(s.free_stock)} {s.stock_unit_1 || ""}</dd>
              <dt>On SO</dt><dd>{stk(s.so_qty)} {s.stock_unit_1 || ""}</dd>
              <dt>Unit</dt><dd>{s.stock_unit_1 || "—"} (£/{s.stock_unit_1 || "Kg"})</dd>
              <dt>Weight / m</dt><dd>{s.weight_per_metre ? `${s.weight_per_metre} kg/m` : "—"}</dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Pricing <button className="link-btn" onClick={() => { setEditPrice(p => !p); setPriceMsg(null) }}>{editPrice ? "cancel" : "edit"}</button></h3>
            {!editPrice ? (
              <dl>
                <dt>Cost</dt><dd>{s.cost_price != null ? `£${Number(s.cost_price).toFixed(4)}` : "—"}</dd>
                <dt>List</dt><dd>{s.list_price != null ? `£${Number(s.list_price).toFixed(4)}` : "—"}</dd>
                <dt>Sell</dt><dd>{s.sell_price != null ? `£${Number(s.sell_price).toFixed(4)}` : "—"}</dd>
                <dt>Reorder level</dt><dd>{s.reorder_level != null ? stk(s.reorder_level) : "—"}</dd>
                <dt>Reorder qty</dt><dd>{s.reorder_qty != null ? stk(s.reorder_qty) : "—"}</dd>
              </dl>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.85rem" }}>
                {([["Cost £", pCost, setPCost], ["Sell £", pSell, setPSell], ["List £", pList, setPList],
                   ["Reorder level", pReorderLevel, setPReorderLevel], ["Reorder qty", pReorderQty, setPReorderQty]] as [string, string, (v: string) => void][]).map(([label, val, set]) => (
                  <label key={label} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span style={{ width: "8rem" }}>{label}</span>
                    <input type="number" step="0.0001" value={val} onChange={e => set(e.target.value)} style={{ width: "8rem" }} />
                  </label>
                ))}
                <button className="action-btn" onClick={savePrices} disabled={priceBusy} style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}>
                  {priceBusy ? "Saving…" : "Save prices"}
                </button>
                {priceMsg && <p style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>{priceMsg}</p>}
              </div>
            )}
          </div>
        </div>
        <StockItemBatches company={company} code={s.account_code} />
        {purchaseHistory && purchaseHistory.length > 0 && (
          <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
            <h3>Purchase history (last 100 receipts)</h3>
            <table>
              <thead>
                <tr><th>GRN</th><th>Date</th><th>Supplier</th><th>PO</th><th className="r">Qty</th><th className="r">Price</th><th>Basis</th></tr>
              </thead>
              <tbody>
                {purchaseHistory.map(g => (
                  <tr key={g.grn_no}>
                    <td><a href={`#/${company}/grn/${encodeURIComponent(g.grn_no)}`}><code>{g.grn_no}</code></a></td>
                    <td>{g.confirmed_at?.slice(0, 10) || g.created_at?.slice(0, 10) || "—"}</td>
                    <td>{g.supplier_name || g.supplier_account || "—"}</td>
                    <td>{g.purchase_order_no ? <a href={`#/${company}/purchase-orders/${encodeURIComponent(g.purchase_order_no)}`}><code>{g.purchase_order_no}</code></a> : "—"}</td>
                    <td className="r">{g.quantity != null ? `${g.quantity} ${g.unit || ""}`.trim() : "—"}</td>
                    <td className="r">{g.price_gbp != null ? `£${g.price_gbp.toFixed(4)}` : "—"}</td>
                    <td>{g.price_basis || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {despatchHistory && despatchHistory.length > 0 && (
          <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
            <h3>Despatch history (last 100)</h3>
            <table>
              <thead>
                <tr><th>DN</th><th>Date</th><th>Customer</th><th>SO</th><th className="r">Qty</th><th className="r">Theo kg</th></tr>
              </thead>
              <tbody>
                {despatchHistory.map(d => (
                  <tr key={d.doc_no}>
                    <td><a href={`#/${company}/delivery-notes/${encodeURIComponent(d.doc_no)}`}><code>{d.doc_no}</code></a></td>
                    <td>{d.date?.slice(0, 10) || "—"}</td>
                    <td>{d.customer_account
                      ? <a href={`#/${company}/customers/${encodeURIComponent(d.customer_account)}`}>{d.customer_name || d.customer_account}</a>
                      : "—"}</td>
                    <td>{d.sales_order_no ? <a href={`#/${company}/sales-orders/${encodeURIComponent(d.sales_order_no)}`}><code>{d.sales_order_no}</code></a> : "—"}</td>
                    <td className="r">{d.qty ?? "—"}</td>
                    <td className="r">{d.weight_theoretical_kg ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
          <h3>Stock ledger (last 50)</h3>
          {txns && txns.length > 0 ? (
            <table>
              <thead><tr><th>Date</th><th>Type</th><th className="r">Qty</th><th>Unit</th><th>Cert</th><th>Ref doc</th><th>Notes</th></tr></thead>
              <tbody>
                {txns.map(t => (
                  <tr key={t.id}>
                    <td>{t.created_at?.slice(0, 10)}</td>
                    <td><Badge value={t.txn_type} /></td>
                    <td className="r" style={{ color: Number(t.qty) < 0 ? "var(--color-fail, #c00)" : undefined }}>{t.qty}</td>
                    <td>{t.unit || "—"}</td>
                    <td>{t.cert_ref || "—"}</td>
                    <td>{t.ref_doc_no || "—"}</td>
                    <td>{t.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="state-msg">No transactions yet.</p>}
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: "0.8rem", display: "block" }}>Adj qty (+ in / − out)</label>
              <input type="number" value={adjQty} onChange={e => setAdjQty(e.target.value)}
                placeholder="e.g. −5.2 or 10" style={{ width: "10rem" }} />
            </div>
            <div>
              <label style={{ fontSize: "0.8rem", display: "block" }}>Ref doc</label>
              <input value={adjRef} onChange={e => setAdjRef(e.target.value)} placeholder="optional" style={{ width: "8rem" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.8rem", display: "block" }}>Reason</label>
              <input value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="stock count / write-off / correction…" style={{ width: "100%" }} />
            </div>
            <button className="action-btn" onClick={recordAdj} disabled={adjBusy}>
              {adjBusy ? "Saving…" : "Record adjustment"}
            </button>
          </div>
          {adjMsg && <p style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>{adjMsg}</p>}
        </div>
        <DemandForecastPanel company={company} stockCode={s.account_code} />
      </>}
    </DetailShell>
  )
}

function DemandForecastPanel({ company, stockCode }: { company: string; stockCode: string }) {
  const [open, setOpen] = useState(false)
  const { data, loading } = useData(
    () => open ? api.demand.forecast(company, stockCode) : Promise.resolve(null),
    [company, stockCode, open]
  )
  const CONF_COLOR: Record<string, string> = { high: "#38a169", medium: "#d69e2e", low: "#718096" }

  return (
    <details style={{ marginTop: "1.5rem" }} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9rem", padding: "0.5rem 0" }}>
        Demand Forecast (30-day)
      </summary>
      {loading && <p className="state-msg">Loading…</p>}
      {data && (
        <div style={{ marginTop: "0.75rem" }}>
          {data.message
            ? <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)" }}>{data.message}</p>
            : <>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                {[
                  ["30-day forecast", data.forecast_qty_30d != null ? data.forecast_qty_30d.toFixed(2) : "—"],
                  ["Free stock", data.free_stock_qty != null ? data.free_stock_qty.toFixed(2) : "—"],
                  ["Incoming POs", data.incoming_po_qty != null ? data.incoming_po_qty.toFixed(2) : "—"],
                  ["Available", data.available_qty != null ? data.available_qty.toFixed(2) : "—"],
                  ["Shortage", data.shortage_qty != null ? data.shortage_qty.toFixed(2) : "none"],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: "var(--color-surface-alt,#f7fafc)", padding: "0.5rem 0.75rem", borderRadius: "6px", minWidth: "120px" }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted,#888)" }}>{label}</div>
                    <strong style={{ color: label === "Shortage" && data.shortage_qty ? "#e53e3e" : undefined }}>{val}</strong>
                  </div>
                ))}
                {data.confidence && (
                  <div style={{ background: "var(--color-surface-alt,#f7fafc)", padding: "0.5rem 0.75rem", borderRadius: "6px" }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted,#888)" }}>Confidence</div>
                    <strong style={{ color: CONF_COLOR[data.confidence] ?? "#333" }}>{data.confidence}</strong>
                    <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted,#888)" }}>({data.history_months} months)</div>
                  </div>
                )}
              </div>
              {data.suggest_reorder && (
                <p style={{ fontSize: "0.85rem", color: "#e53e3e", fontWeight: 600 }}>
                  ⚠ Reorder suggested — forecast demand exceeds available stock
                </p>
              )}
              {data.history.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                    <thead><tr><th>Month</th><th className="r">Despatched qty</th></tr></thead>
                    <tbody>
                      {data.history.map(h => (
                        <tr key={h.month}><td>{h.month}</td><td className="r">{h.qty.toFixed(2)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          }
        </div>
      )}
    </details>
  )
}

// ── New Purchase Order ────────────────────────────────────────────────────────

type POFormLine = { stock_account_code: string; description: string; qty_ordered: string; unit: string; price: string; grade?: string; size_1_mm?: number }
const blankLine = (): POFormLine => ({ stock_account_code: "", description: "", qty_ordered: "", unit: "KG", price: "" })

export function PONew({ company, initialStock, initialQty }: { company: string; initialStock?: string; initialQty?: number }) {
  const [supplier, setSupplier] = useState("")
  const [ref, setRef] = useState("")
  const [lines, setLines] = useState<POFormLine[]>(
    initialStock ? [{ ...blankLine(), stock_account_code: initialStock, qty_ordered: initialQty ? String(initialQty) : "" }] : [blankLine()]
  )
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const setLine = (i: number, patch: Partial<POFormLine>) =>
    setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  async function extract() {
    if (!files.length) { setMsg("Choose a PO or delivery-note PDF first"); return }
    setBusy(true); setMsg("Extracting…")
    try {
      const x = await api.purchases.extract(company, files)
      if (x.supplier_name && !supplier) setSupplier(x.supplier_name)
      if (x.supplier_ref) setRef(x.supplier_ref)
      const xl = (x.lines ?? []).map(l => ({
        stock_account_code: l.stock_code ?? "", description: l.description ?? "",
        qty_ordered: l.qty != null ? String(l.qty) : "", unit: l.unit || "KG",
        price: l.price_per_unit != null ? String(l.price_per_unit) : "",
        grade: l.grade ?? undefined, size_1_mm: l.size_mm ?? undefined,
      }))
      if (xl.length) setLines(xl)
      setMsg(`Extracted ${xl.length} line(s) — review, fill any missing codes, then save`)
    } catch (e) { setMsg(String(e)) } finally { setBusy(false) }
  }

  async function save() {
    const valid = lines.filter(l => l.stock_account_code.trim() && Number(l.qty_ordered) > 0)
    if (!valid.length) { setMsg("Add at least one line with a stock code and quantity"); return }
    setBusy(true)
    try {
      const r = await api.purchases.createOrder(company, {
        supplier_account: supplier.trim() || undefined, supplier_ref: ref.trim() || undefined,
        lines: valid.map(l => ({
          stock_account_code: l.stock_account_code.trim().toUpperCase(),
          description: l.description.trim() || undefined,
          qty_ordered: Number(l.qty_ordered), unit: l.unit.trim().toUpperCase() || "KG",
          price: Number(l.price) || 0,
          attribute_3: l.grade || undefined, size_1_mm: l.size_1_mm,
        })),
      })
      window.location.hash = `#/${company}/purchase-orders/${encodeURIComponent(r.order_no)}`
    } catch (e) { setMsg(String(e)); setBusy(false) }
  }

  return (
    <div className="grn-shell">
      <a href={`#/${company}/purchase-orders`} className="back-link">← Purchase Orders</a>
      <h2 className="grn-title">New purchase order</h2>
      <div className="grn-form">
        <div className="grn-section">
          <h3>Populate from a supplier PO / delivery note (PDF)</h3>
          <input className="grn-file-input" type="file" accept="application/pdf,image/*" multiple
            onChange={e => setFiles(Array.from(e.target.files ?? []))} />
          <div className="grn-actions">
            <button className="action-btn" disabled={busy} onClick={extract}>Extract with AI</button>
          </div>
        </div>
        <div className="grn-section">
          <h3>Supplier</h3>
          <div className="grn-grid">
            <label className="grn-label">Supplier account
              <SupplierPicker company={company} value={supplier} onChange={setSupplier} /></label>
            <label className="grn-label">Supplier reference
              <input className="grn-input" value={ref} onChange={e => setRef(e.target.value)} /></label>
          </div>
        </div>
        <div className="grn-section">
          <h3>Lines</h3>
          <table>
            <thead><tr><th>Stock code</th><th>Description</th><th className="r">Qty</th><th>Unit</th><th className="r">£/unit</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td><input value={l.stock_account_code} placeholder="code" onChange={e => setLine(i, { stock_account_code: e.target.value.toUpperCase() })} /></td>
                  <td><input value={l.description} onChange={e => setLine(i, { description: e.target.value })} style={{ minWidth: "14em" }} /></td>
                  <td className="r"><input type="number" value={l.qty_ordered} onChange={e => setLine(i, { qty_ordered: e.target.value })} style={{ width: "6em" }} /></td>
                  <td><input value={l.unit} onChange={e => setLine(i, { unit: e.target.value.toUpperCase() })} style={{ width: "4em" }} /></td>
                  <td className="r"><input type="number" value={l.price} onChange={e => setLine(i, { price: e.target.value })} style={{ width: "6em" }} /></td>
                  <td>{lines.length > 1 && <button aria-label="Remove line" title="Remove line" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grn-actions">
            <button onClick={() => setLines(ls => [...ls, blankLine()])}>+ Add line</button>
          </div>
          <p style={{ fontSize: ".8rem", color: "var(--text-muted)" }}>
            Unknown stock codes are created automatically; each line raises the item's <strong>On Order</strong> quantity.
          </p>
        </div>
        <div className="grn-actions">
          <button className="action-btn" disabled={busy} onClick={save}>Create purchase order</button>
          {msg && <span className="badge">{msg}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Purchase Order Detail ─────────────────────────────────────────────────────

export function PurchaseOrderDetail({ company, id }: { company: string; id: string }) {
  const [rev, setRev] = useState(0)
  const [invNo, setInvNo] = useState("")
  const [invNet, setInvNet] = useState("")
  const [invVat, setInvVat] = useState("")
  const [invStatus, setInvStatus] = useState("received")
  const [invMsg, setInvMsg] = useState<string | null>(null)
  const { data: o, loading, error } = useData<PurchaseOrderDetail>(
    () => api.purchases.getOrder(company, id), [company, id, rev]
  )
  const { data: grns } = useData<Awaited<ReturnType<typeof api.grn.list>>>(
    () => o ? api.grn.list(company, o.order_no) : Promise.resolve([]),
    [company, o?.order_no]
  )

  async function recordInvoice() {
    if (!o) return
    if (!invNo.trim()) { setInvMsg("Enter the supplier invoice number"); return }
    setInvMsg(null)
    try {
      await api.purchases.invoiceMatch(company, o.order_no, {
        supplier_invoice_no: invNo.trim(),
        matched_net_gbp: invNet ? parseFloat(invNet) : undefined,
        matched_vat_gbp: invVat ? parseFloat(invVat) : undefined,
        matched_status: invStatus,
      })
      setInvNo(""); setInvNet(""); setInvVat(""); setRev(r => r + 1)
      setInvMsg("Invoice recorded")
    } catch (e) { setInvMsg(String(e)) }
  }

  return (
    <DetailShell loading={loading} error={error}>
      {o && <>
        <a href={`#/${company}/purchase-orders`} className="back-link">← Purchase Orders</a>
        <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <button className="action-btn" onClick={async () => { try { window.open(await api.purchases.pdf(company, o.order_no), "_blank") } catch (e) { alert(String(e)) } }}>PDF</button>
          <a className="action-btn" href={`#/${company}/grn/new?po=${encodeURIComponent(o.order_no)}`}>Receive goods</a>
          {o.matched_status === "received" && (
            <button onClick={async () => { try { await api.purchases.invoiceMatch(company, o.order_no, { matched_status: "approved" }); setRev(r => r + 1) } catch (e) { alert(String(e)) } }}>Approve invoice</button>
          )}
          {o.matched_status === "approved" && (
            <button onClick={async () => { try { await api.purchases.invoiceMatch(company, o.order_no, { matched_status: "paid" }); setRev(r => r + 1) } catch (e) { alert(String(e)) } }}>Mark paid</button>
          )}
          {o.status !== "closed"
            ? <button onClick={async () => { try { await api.purchases.invoiceMatch(company, o.order_no, { po_status: "closed" }); setRev(r => r + 1) } catch (e) { alert(String(e)) } }}>Close PO</button>
            : <button onClick={async () => { try { await api.purchases.invoiceMatch(company, o.order_no, { po_status: "open" }); setRev(r => r + 1) } catch (e) { alert(String(e)) } }}>Reopen PO</button>}
        </div>
        <div className="detail-grid">
          <div className="detail-card">
            <h3>Order</h3>
            <dl>
              <dt>Order No</dt><dd><code>{o.order_no}</code></dd>
              <dt>Supplier</dt><dd>
                <a href={`#/${company}/suppliers/${encodeURIComponent(o.supplier_account)}`}>
                  {o.supplier_name || o.supplier_account}
                </a>
              </dd>
              <dt>Ref</dt><dd>{o.supplier_ref || "—"}</dd>
              <dt>Order Date</dt><dd>{fmtDate(o.order_date_serial)}</dd>
              <dt>Deliver By</dt><dd>{fmtDate(o.deliver_by_serial)}</dd>
              <dt>Status</dt><dd><Badge value={o.status} /></dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Amounts</h3>
            <dl>
              <dt>Net</dt><dd>{pence(o.net_amount)}</dd>
              <dt>VAT</dt><dd>{pence(o.vat)}</dd>
              <dt>Total</dt><dd>{pence(o.total_amount)}</dd>
            </dl>
            {o.order_notes && <p style={{fontSize:".85rem", marginTop:".5rem"}}>{o.order_notes}</p>}
          </div>
          <div className="detail-card">
            <h3>Invoice</h3>
            {o.supplier_invoice_no ? (
              <dl>
                <dt>Invoice No</dt><dd><code>{o.supplier_invoice_no}</code></dd>
                <dt>Status</dt><dd><Badge value={o.matched_status || "received"} /></dd>
                <dt>Net</dt><dd>{o.matched_net_amount ? fmtGbp(Number(o.matched_net_amount) / 100) : "—"}</dd>
                <dt>VAT</dt><dd>{o.matched_vat_amount ? fmtGbp(Number(o.matched_vat_amount) / 100) : "—"}</dd>
                {o.invoice_approved_by && <><dt>Approved by</dt><dd>{o.invoice_approved_by}{o.invoice_approved_at ? ` · ${o.invoice_approved_at.slice(0, 16).replace("T", " ")}` : ""}</dd></>}
                {o.invoice_paid_at && <><dt>Paid at</dt><dd>{o.invoice_paid_at.slice(0, 16).replace("T", " ")}</dd></>}
              </dl>
            ) : <p className="state-msg">No invoice recorded yet.</p>}
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              <input value={invNo} onChange={e => setInvNo(e.target.value)} placeholder="Supplier inv no" style={{ width: "9rem" }} />
              <input type="number" value={invNet} onChange={e => setInvNet(e.target.value)} placeholder="Net £" style={{ width: "6rem" }} />
              <input type="number" value={invVat} onChange={e => setInvVat(e.target.value)} placeholder="VAT £" style={{ width: "5rem" }} />
              <select value={invStatus} onChange={e => setInvStatus(e.target.value)}>
                <option value="received">Received</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="disputed">Disputed</option>
              </select>
              <button className="action-btn" onClick={recordInvoice}>Save</button>
            </div>
            {invMsg && <p style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>{invMsg}</p>}
          </div>
        </div>
        {o.lines.length > 0 && (
          <div className="detail-lines">
            <h3>Lines</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Stock Code</th><th>Description</th>
                  <th className="r">Ordered</th><th className="r">Received</th>
                  <th>Unit</th><th className="r">Total</th><th>Status</th><th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l: PurchaseOrderLine) => (
                  <tr key={l.line_no}>
                    <td>{l.line_no}</td>
                    <td>{l.stock_account_code
                      ? <a href={`#/${company}/stock/${encodeURIComponent(l.stock_account_code)}`}><code>{l.stock_account_code}</code></a>
                      : "—"}</td>
                    <td>{l.description_1 || l.short_description || "—"}</td>
                    <td className="r">{l.qty_ordered ?? "—"}</td>
                    <td className="r">{l.qty_received ?? "—"}</td>
                    <td>{l.unit_ordered_display || "—"}</td>
                    <td className="r">{fmtGbp(l.line_total_gbp)}</td>
                    <td><Badge value={l.status} /></td>
                    <td>{fmtDate(l.delivery_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {grns && grns.length > 0 && (
          <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
            <h3>Deliveries received (GRNs)</h3>
            <table>
              <thead>
                <tr>
                  <th>GRN No</th><th>Stock Code</th><th>Heat No</th>
                  <th className="r">Qty</th><th>Cert</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {grns.map(g => (
                  <tr key={g.grn_no}>
                    <td><a href={`#/${company}/grn/${encodeURIComponent(g.grn_no!)}`}><code>{g.grn_no}</code></a></td>
                    <td>{g.stock_account_code ? <code>{g.stock_account_code}</code> : "—"}</td>
                    <td>{g.heat_no || "—"}</td>
                    <td className="r">{g.quantity != null ? `${g.quantity} ${g.unit || ""}`.trim() : "—"}</td>
                    <td>{g.cert_ref || "—"}</td>
                    <td>{g.confirmed_at?.slice(0, 10) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}
    </DetailShell>
  )
}

// ── Dispatch (mobile picking screen) ─────────────────────────────────────────

type PickLine = SalesOrderLine & { dispatchQty: number; done: boolean }

export function DispatchView({ company, id }: { company: string; id: string }) {
  const { data: order, loading, error } = useData(
    () => api.sales.getOrder(company, id), [company, id]
  )

  const [lines, setLines] = useState<PickLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [submitErr, setSubmitErr] = useState<string | null>(null)

  useEffect(() => {
    if (order?.lines) {
      setLines(order.lines.map(l => ({
        ...l,
        dispatchQty: Number(l.qty_ordered ?? 0) - Number(l.qty_sent ?? 0),
        done: false,
      })))
    }
  }, [order])

  const setQty = (i: number, qty: number) =>
    setLines(ls => ls.map((l, j) => j === i ? { ...l, dispatchQty: qty } : l))

  const toggleDone = (i: number) =>
    setLines(ls => ls.map((l, j) => j === i ? { ...l, done: !l.done } : l))

  const toDispatch = lines.filter(l => l.done && l.dispatchQty > 0)

  async function confirmDispatch() {
    if (!toDispatch.length) return
    setSubmitting(true)
    setSubmitErr(null)
    try {
      const res = await api.dispatch.create(company, {
        sales_order_no: order!.order_no,
        lines: toDispatch.map(l => ({
          line_no:           l.line_no,
          stock_account_code: l.stock_account_code,
          short_description: l.short_description,
          qty:               l.dispatchQty,
          unit:              l.unit_ordered_display,
          sell_price:        l.price ? Number(l.price) : undefined,
        })),
      })
      setResult(`${res.doc_no} raised — ${res.line_count} line(s), £${res.net_gbp?.toFixed(2) ?? "0.00"}`)
      setLines(ls => ls.map(l => l.done ? { ...l, done: false } : l))
    } catch (e) {
      setSubmitErr(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DetailShell loading={loading} error={error}>
      {order && <>
        <a href={`#/${company}/sales-orders/${encodeURIComponent(order.order_no)}`}
           className="back-link">← {order.order_no}</a>
        <div className="dispatch-header">
          <div className="dispatch-customer">{(order as any).customer_name ?? order.customer_account}</div>
          <div className="dispatch-ref">{(order as any).customer_ref ?? ""}</div>
        </div>

        {result && <p className="dispatch-ok">{result}</p>}
        {submitErr && <p className="state-err">{submitErr}</p>}

        <div className="pick-lines">
          {lines.map((l, i) => {
            const remaining = Number(l.qty_ordered ?? 0) - Number(l.qty_sent ?? 0)
            if (remaining <= 0) return null
            return (
              <div key={l.line_no} className={`pick-card${l.done ? " pick-card--done" : ""}`}>
                <div className="pick-code"><code>{l.stock_account_code}</code></div>
                <div className="pick-desc">{l.short_description}</div>
                <div className="pick-row">
                  <span className="pick-label">Ordered</span>
                  <span className="pick-val">{Number(l.qty_ordered ?? 0)} {l.unit_ordered_display}</span>
                </div>
                <div className="pick-row">
                  <span className="pick-label">Despatched</span>
                  <span className="pick-val">{Number(l.qty_sent ?? 0)} {l.unit_ordered_display}</span>
                </div>
                <div className="pick-row">
                  <span className="pick-label">Outstanding</span>
                  <span className="pick-val">{remaining} {l.unit_ordered_display}</span>
                </div>
                <div className="pick-row">
                  <span className="pick-label">Dispatch qty</span>
                  <input
                    type="number"
                    className="pick-qty-input"
                    value={l.dispatchQty}
                    min={0}
                    max={remaining}
                    step="any"
                    onChange={e => setQty(i, parseFloat(e.target.value) || 0)}
                  />
                  <span className="pick-unit">{l.unit_ordered_display}</span>
                </div>
                <button
                  className={`pick-confirm-btn${l.done ? " pick-confirm-btn--done" : ""}`}
                  onClick={() => toggleDone(i)}
                >
                  {l.done ? "✓ Confirmed" : "Confirm pick"}
                </button>
              </div>
            )
          })}
        </div>

        {toDispatch.length > 0 && (
          <div className="dispatch-footer">
            <span>{toDispatch.length} line(s) ready</span>
            <button
              className="dispatch-submit-btn"
              disabled={submitting}
              onClick={confirmDispatch}
            >
              {submitting ? "Dispatching…" : `Dispatch ${toDispatch.length} line(s)`}
            </button>
          </div>
        )}
      </>}
    </DetailShell>
  )
}

// ── GRN list ──────────────────────────────────────────────────────────────────
export function GRNList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const q = useDebounce(search, 300)
  const { data: rows, loading, error } = useData<Awaited<ReturnType<typeof api.grn.list>>>(
    () => api.grn.list(company, q), [company, q]
  )

  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Goods Received Notes">
        <SearchBar value={search} onChange={setSearch} />
        <button className="action-btn" onClick={() => location.hash = `#/${company}/grn/new`}>+ New GRN</button>
      </Toolbar>
      <table>
        <thead><tr>
          <th>GRN No</th><th>Supplier</th><th>Stock Code</th><th>Heat No</th><th>Grade</th>
          <th>Qty</th><th>Warehouse</th><th>Created</th><th>Conform</th>
        </tr></thead>
        <tbody>
          {(rows ?? []).map(r => (
            <tr key={r.grn_no} className="row-link"
              onClick={() => location.hash = `#/${company}/grn/${encodeURIComponent(r.grn_no)}`}>
              <td><strong className="row-link-id">{r.grn_no}</strong></td>
              <td>{r.supplier_name || r.supplier_account || "—"}</td>
              <td>{r.stock_account_code || "—"}</td>
              <td>{r.heat_no || "—"}</td>
              <td>{r.grade || "—"}</td>
              <td>{r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : "—"}</td>
              <td>{r.warehouse || "—"}</td>
              <td>{r.created_at?.slice(0, 10)}</td>
              <td>{r.conformance_pass === true
                ? <span className="badge badge--pass">PASS</span>
                : r.conformance_pass === false
                ? <span className="badge badge--fail">FAIL</span>
                : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  )
}

// ── GRN detail ────────────────────────────────────────────────────────────────

export function GRNDetail({ company, id }: { company: string; id: string }) {
  const { data: grn, loading, error } = useData(() => api.grn.get(company, id), [company, id])
  const chemKeys = grn?.chemistry ? CHEM_KEYS.filter(k => grn.chemistry![k] != null) : []
  const mechKeys = grn?.mechanical ? MECH_KEYS.filter(k => grn.mechanical![k] != null) : []

  async function viewCerts() {
    try {
      const certs = await api.grn.certs(company, id)
      certs.forEach(c => window.open(c.url, "_blank", "noopener"))
    } catch (e) { console.error(e) }
  }

  return (
    <Shell loading={loading} error={error}>
      <a className="back-link" href={`#/${company}/grn`}>← Back to GRNs</a>
      {grn && (
        <div className="grn-shell">
          <div className="detail-grid">
            <div className="detail-card">
              <h3>Receipt</h3>
              <dl>
                <dt>Supplier</dt><dd>{grn.supplier_account
                  ? <a href={`#/${company}/suppliers/${encodeURIComponent(grn.supplier_account)}`}>{grn.supplier_account}</a>
                  : "—"}</dd>
                <dt>PO No</dt><dd>{grn.purchase_order_no
                  ? <a href={`#/${company}/purchase-orders/${encodeURIComponent(grn.purchase_order_no)}`}>{grn.purchase_order_no}</a>
                  : "—"}</dd>
                <dt>Delivery Note</dt><dd>{grn.delivery_note_ref || "—"}</dd>
                <dt>Stock Code</dt><dd>{grn.stock_account_code
                  ? <a href={`#/${company}/stock/${encodeURIComponent(grn.stock_account_code)}`}>{grn.stock_account_code}</a>
                  : "—"}</dd>
                <dt>Quantity</dt><dd>{grn.quantity != null ? `${grn.quantity} ${grn.unit ?? ""}` : "—"}</dd>
                <dt>Length</dt><dd>{grn.length_mm != null ? `${grn.length_mm} mm` : "—"}</dd>
                <dt>Warehouse</dt><dd>{grn.warehouse || "—"}</dd>
                {grn.linked_batch_no && <>
                  <dt>Batch</dt><dd>
                    <a href={`#/${company}/batches/${encodeURIComponent(grn.linked_batch_no)}`}>
                      {grn.linked_batch_no}
                    </a>
                  </dd>
                </>}
              </dl>
            </div>
            <div className="detail-card">
              <h3>Material / Cert</h3>
              <dl>
                <dt>Heat No</dt><dd>{grn.heat_no || "—"}</dd>
                <dt>Cert Ref</dt><dd>{grn.cert_ref || "—"}</dd>
                <dt>Spec</dt><dd>{grn.spec || "—"}</dd>
                <dt>Grade</dt><dd>{grn.grade || "—"}</dd>
                <dt>Cert Standard</dt><dd>{grn.cert_standard || "—"}</dd>
                {grn.manufacturer_account && <>
                  <dt>Manufacturer</dt><dd>
                    <a href={`#/${company}/suppliers/${encodeURIComponent(grn.manufacturer_account)}`}>
                      {grn.manufacturer_name || grn.manufacturer_account}
                    </a>
                  </dd>
                </>}
                {grn.country_of_origin && <>
                  <dt>Country</dt><dd>{grn.country_of_origin}</dd>
                </>}
              </dl>
            </div>
            <div className="detail-card">
              <h3>Pricing</h3>
              <dl>
                <dt>Price</dt><dd>{grn.price_gbp != null ? `£${grn.price_gbp} / ${grn.price_basis}` : "—"}</dd>
                <dt>Alloy surcharge</dt><dd>{grn.alloy_surcharge_pence != null ? `£${(grn.alloy_surcharge_pence/100).toFixed(2)}` : "—"}</dd>
                <dt>Confirmed</dt><dd>{grn.confirmed_at?.slice(0,10) || "—"}</dd>
              </dl>
            </div>
          </div>

          {chemKeys.length > 0 && (
            <div className="grn-section" style={{ marginBottom: "1rem" }}>
              <h3>Chemistry</h3>
              <table className="conform-table">
                <thead><tr>{chemKeys.map(k => <th key={k}>{k}</th>)}</tr></thead>
                <tbody><tr>{chemKeys.map(k => <td key={k}>{grn.chemistry![k]}</td>)}</tr></tbody>
              </table>
            </div>
          )}

          {mechKeys.length > 0 && (
            <div className="grn-section" style={{ marginBottom: "1rem" }}>
              <h3>Mechanical</h3>
              <table className="conform-table">
                <thead><tr>{mechKeys.map(k => <th key={k}>{k.replace(/_/g," ")}</th>)}</tr></thead>
                <tbody><tr>{mechKeys.map(k => <td key={k}>{grn.mechanical![k]}</td>)}</tr></tbody>
              </table>
            </div>
          )}

          {grn.conformance && grn.conformance.length > 0 && (
            <div className="grn-section" style={{ marginBottom: "1rem" }}>
              <h3>Spec conformance &nbsp;
                {grn.conformance.every(r => r.pass)
                  ? <span className="badge badge--pass">PASS</span>
                  : <span className="badge badge--fail">FAIL</span>}
              </h3>
              <table className="conform-table">
                <thead><tr><th>Element</th><th>Cert value</th><th>Lower</th><th>Upper</th><th>Result</th></tr></thead>
                <tbody>
                  {grn.conformance.map(r => (
                    <tr key={r.element} className={r.pass ? "conform-pass" : "conform-fail"}>
                      <td>{r.element}</td><td>{r.cert_value}</td>
                      <td>{r.lower ?? "—"}</td><td>{r.upper ?? "—"}</td>
                      <td>{r.pass ? "✓ PASS" : "✗ FAIL"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(grn.cert_paths?.length ?? 0) > 0 && (
            <button className="action-btn" onClick={viewCerts}>
              View certs ({grn.cert_paths!.length})
            </button>
          )}
        </div>
      )}
    </Shell>
  )
}

// ── Stock batches list ────────────────────────────────────────────────────────
type SplitState = { batchNo: string; max: number; qty: string; length_mm: string; saving: boolean; err: string | null }

type BatchFilterState = { search: string; account_code: string; grade: string; status: string; warehouse: string; uncerted: boolean }

export function StockBatchList({ company }: { company: string }) {
  const [rows, setRows] = useState<StockBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [split, setSplit] = useState<SplitState | null>(null)
  const [f, setF] = useState<BatchFilterState>({ search: "", account_code: "", grade: "", status: "", warehouse: "", uncerted: false })
  const [summary, setSummary] = useState<StockSummaryRow[] | null>(null)
  const qSearch = useDebounce(f.search, 400)

  const reload = useCallback(() => {
    setLoading(true)
    api.batches.list(company, {
      search: qSearch || undefined, account_code: f.account_code || undefined,
      grade: f.grade || undefined,
      status: f.status || undefined, warehouse: f.warehouse || undefined,
      uncerted: f.uncerted || undefined,
    }).then(setRows).catch(console.error).finally(() => setLoading(false))
  }, [company, qSearch, f.account_code, f.grade, f.status, f.warehouse, f.uncerted])
  useEffect(() => { reload() }, [reload])

  async function confirmSplit() {
    if (!split) return
    const qty = parseFloat(split.qty)
    if (!qty || qty <= 0) return
    setSplit(s => s && { ...s, saving: true, err: null })
    try {
      const body: { qty_cut: number; length_mm?: number } = { qty_cut: qty }
      if (split.length_mm) body.length_mm = parseFloat(split.length_mm)
      await api.batches.split(company, split.batchNo, body)
      setSplit(null)
      reload()
    } catch (e) {
      setSplit(s => s && { ...s, saving: false, err: String(e) })
    }
  }

  async function toggleSummary() {
    if (summary) { setSummary(null); return }
    try { setSummary(await api.batches.summary(company)) } catch (e) { console.error(e) }
  }

  return (
    <Shell loading={loading} error={null}>
      <Toolbar title="Stock Batches">
        <button className="action-btn" onClick={toggleSummary}>{summary ? "Hide summary" : "Stock summary"}</button>
      </Toolbar>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", alignItems: "center" }}>
        <input placeholder="Search batch / heat / grade / code" value={f.search} onChange={e => setF({ ...f, search: e.target.value })} />
        <StockPicker company={company} value={f.account_code} placeholder="Filter by stock code…"
          onPick={(code, item) => { if (item) setF(s => ({ ...s, account_code: code })) }} />
        {f.account_code && <button onClick={() => setF(s => ({ ...s, account_code: "" }))} title="Clear stock code">✕ code</button>}
        <input placeholder="Grade" value={f.grade} onChange={e => setF({ ...f, grade: e.target.value })} />
        <input placeholder="Warehouse" value={f.warehouse} onChange={e => setF({ ...f, warehouse: e.target.value })} />
        <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="available">available</option>
          <option value="allocated">allocated</option>
          <option value="depleted">depleted</option>
          <option value="returned">returned</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={f.uncerted} onChange={e => setF({ ...f, uncerted: e.target.checked })} /> Uncerted only
        </label>
      </div>
      {summary && (
        <div className="grn-section" style={{ marginBottom: "1rem" }}>
          <h3>Stock position (available, by grade / warehouse)</h3>
          <table className="conform-table">
            <thead><tr><th>Grade</th><th>Warehouse</th><th>Batches</th><th>Qty avail</th><th>Theo kg</th><th>Actual kg</th></tr></thead>
            <tbody>
              {summary.map((s, i) => (
                <tr key={i}><td>{s.grade}</td><td>{s.warehouse}</td><td>{s.batches}</td>
                  <td>{s.qty_available ?? "—"}</td><td>{s.weight_theoretical_kg ?? "—"}</td><td>{s.weight_actual_kg ?? "—"}</td></tr>
              ))}
              {summary.length === 0 && <tr><td colSpan={6} className="state-msg">No stock.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {split && (
        <div className="split-panel">
          <strong>Split {split.batchNo}</strong>
          <label>Qty to cut (max {split.max})</label>
          <input type="number" min="0.0001" max={split.max} step="any"
            value={split.qty} onChange={e => setSplit(s => s && { ...s, qty: e.target.value })} />
          <label>Length (mm, optional)</label>
          <input type="number" min="1" step="1"
            value={split.length_mm} onChange={e => setSplit(s => s && { ...s, length_mm: e.target.value })} />
          {split.err && <span className="badge badge--fail">{split.err}</span>}
          <div className="split-actions">
            <button className="action-btn" disabled={split.saving} onClick={confirmSplit}>
              {split.saving ? "Saving…" : "Confirm split"}
            </button>
            <button onClick={() => setSplit(null)}>Cancel</button>
          </div>
        </div>
      )}
      <table>
        <thead><tr>
          <th>Batch No</th><th>GRN</th><th>Stock Code</th><th>Grade</th><th>Spec</th>
          <th>Heat No</th><th>Cert Ref</th><th>Qty Rec'd</th><th>On Orders</th><th>Qty Free</th>
          <th>Unit</th><th>Warehouse</th><th>Conform</th><th>Status</th><th>Date</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map(r => {
            const free = r.qty_available - (r.qty_allocated ?? 0)
            return (
            <tr key={r.id}>
              <td><a className="row-link-id" href={`#/${company}/batches/${encodeURIComponent(r.batch_no)}`}><strong>{r.batch_no}</strong></a></td>
              <td>{r.grn_no}</td>
              <td>{r.stock_account_code}</td>
              <td>{r.grade}</td>
              <td>{r.spec}</td>
              <td>{r.heat_no}</td>
              <td>{r.cert_ref}</td>
              <td>{r.qty_received}</td>
              <td style={{ color: r.qty_allocated > 0 ? "var(--color-warn, #a06000)" : undefined }}>{r.qty_allocated > 0 ? r.qty_allocated : "—"}</td>
              <td style={{ color: free <= 0 ? "var(--color-danger, #c00)" : undefined, fontWeight: r.qty_allocated > 0 ? 600 : undefined }}>{free}</td>
              <td>{r.unit}</td>
              <td>{r.warehouse}</td>
              <td>{r.conformance_pass === true
                ? <span className="badge badge--pass">PASS</span>
                : r.conformance_pass === false
                ? <span className="badge badge--fail">FAIL</span>
                : "—"}</td>
              <td><Badge value={r.status} /></td>
              <td>{r.created_at?.slice(0, 10)}</td>
              <td>{r.status === "available" && r.qty_available > 0 &&
                <button className="action-btn" onClick={() =>
                  setSplit({ batchNo: r.batch_no, max: r.qty_available, qty: "", length_mm: "", saving: false, err: null })
                }>Split</button>
              }</td>
            </tr>
          )})}
        </tbody>
      </table>
    </Shell>
  )
}

// ── GRN new (AI upload + review) ─────────────────────────────────────────────
type GRNDraft = {
  supplier_account: string; purchase_order_no: string; delivery_note_ref: string
  stock_account_code: string; quantity: string; unit: string; length_mm: string
  cert_ref: string; heat_no: string; spec: string; grade: string; cert_standard: string
  price_pence: string; price_basis: string; alloy_surcharge_pence: string; warehouse: string
  manufacturer_account: string; manufacturer_name: string; country_of_origin: string
  chemistry: Record<string, string>; mechanical: Record<string, string>; ai_raw_text: string
  cert_paths: string[]
  conformance: import("./api").ConformanceRow[]
}

const CHEM_KEYS = ["C","Si","Mn","P","S","Cr","Ni","Mo","V","Cu","Al","Ti","Nb","N","B","Co"]
const MECH_KEYS = ["tensile_mpa","proof_02_mpa","proof_1_mpa","elongation_pct","reduction_pct","hardness"]

function emptyDraft(): GRNDraft {
  return {
    supplier_account:"", purchase_order_no:"", delivery_note_ref:"",
    stock_account_code:"", quantity:"", unit:"", length_mm:"",
    cert_ref:"", heat_no:"", spec:"", grade:"", cert_standard:"",
    price_pence:"", price_basis:"T", alloy_surcharge_pence:"", warehouse:"",
    manufacturer_account:"", manufacturer_name:"", country_of_origin:"",
    chemistry: Object.fromEntries(CHEM_KEYS.map(k=>[k,""])),
    mechanical: Object.fromEntries(MECH_KEYS.map(k=>[k,""])),
    ai_raw_text:"", cert_paths: [], conformance: []
  }
}

function fromExtracted(e: Record<string, unknown>): GRNDraft {
  const d = emptyDraft()
  const str = (k: string) => String(e[k] ?? "")
  d.supplier_account   = str("supplier_name")
  d.purchase_order_no  = str("purchase_order_no")
  d.delivery_note_ref  = str("delivery_note_ref")
  d.stock_account_code = str("stock_description")
  d.quantity           = e.quantity != null ? String(e.quantity) : ""
  d.unit               = str("unit")
  d.length_mm          = e.length_mm != null ? String(e.length_mm) : ""
  d.cert_ref           = str("cert_ref")
  d.heat_no            = str("heat_no")
  d.spec               = str("spec")
  d.grade              = str("grade")
  d.cert_standard      = str("cert_standard")
  d.price_pence        = e.price_per_unit != null ? String(Math.round(Number(e.price_per_unit) * 100)) : ""
  d.price_basis        = str("price_basis") || "T"
  d.alloy_surcharge_pence = e.alloy_surcharge != null ? String(Math.round(Number(e.alloy_surcharge) * 100)) : ""
  d.warehouse          = str("warehouse")
  const chem = (e.chemistry as Record<string,unknown>) ?? {}
  CHEM_KEYS.forEach(k => { d.chemistry[k] = chem[k] != null ? String(chem[k]) : "" })
  const mech = (e.mechanical as Record<string,unknown>) ?? {}
  MECH_KEYS.forEach(k => { d.mechanical[k] = mech[k] != null ? String(mech[k]) : "" })
  return d
}

type SuggestedPO = {
  order_no: string
  supplier_account: string
  delivery_date_serial: number | null
  lines: { stock_account_code: string; description: string; qty_ordered: number; qty_received: number; status: string }[]
}

export function GRNNew({ company, initialPO }: { company: string; initialPO?: string }) {
  const [files, setFiles]     = useState<File[]>([])
  const [extracting, setExtr] = useState(false)
  const [draft, setDraft]     = useState<GRNDraft | null>(null)
  const [suggestedPO, setSuggestedPO] = useState<SuggestedPO | null>(null)
  const [poCandidates, setPoCandidates] = useState<SuggestedPO[]>([])
  const [duplicateDN, setDuplicateDN] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState("")
  const [advisory, setAdvisory] = useState<{ status: string; ordered: number; received_total: number; outstanding: number } | null>(null)
  const [error, setError]     = useState("")

  useEffect(() => {
    if (!initialPO) return
    const d = emptyDraft()
    d.purchase_order_no = initialPO
    setDraft(d)
    api.purchases.getOrder(company, initialPO).then(o => {
      setDraft(prev => prev ? { ...prev, supplier_account: o.supplier_account ?? "" } : prev)
      setSuggestedPO({
        order_no: o.order_no,
        supplier_account: o.supplier_account,
        delivery_date_serial: o.deliver_by_serial ? Number(o.deliver_by_serial) : null,
        lines: o.lines.map(l => ({
          stock_account_code: l.stock_account_code ?? "",
          description: l.description_1 || l.short_description || "",
          qty_ordered: parseFloat(l.qty_ordered ?? "0") || 0,
          qty_received: parseFloat(l.qty_received ?? "0") || 0,
          status: l.status ?? "",
        }))
      })
    }).catch(() => {/* PO lookup best-effort */})
  }, [])

  const set = useCallback((field: keyof GRNDraft, val: string) => {
    setDraft(d => d ? { ...d, [field]: val } : d)
  }, [])
  const setChem = useCallback((k: string, val: string) => {
    setDraft(d => d ? { ...d, chemistry: { ...d.chemistry, [k]: val } } : d)
  }, [])
  const setMech = useCallback((k: string, val: string) => {
    setDraft(d => d ? { ...d, mechanical: { ...d.mechanical, [k]: val } } : d)
  }, [])

  async function extract() {
    if (!files.length) return
    setExtr(true); setError("")
    try {
      const result = await api.grn.extract(company, files)
      const d = fromExtracted(result.extracted)
      d.ai_raw_text = result.ai_raw_text
      d.cert_paths = result.cert_paths
      d.conformance = result.conformance ?? []
      setDraft(d)
      setSuggestedPO(result.suggested_po ?? null)
      setPoCandidates(result.po_candidates ?? [])
      setDuplicateDN(result.duplicate_dn ?? false)
    } catch (e: unknown) { setError(String(e)) }
    finally { setExtr(false) }
  }

  async function save() {
    if (!draft) return
    setSaving(true); setError("")
    try {
      const body = {
        ...draft,
        quantity:              draft.quantity ? parseFloat(draft.quantity) : null,
        length_mm:             draft.length_mm ? parseFloat(draft.length_mm) : null,
        price_pence:           draft.price_pence ? parseInt(draft.price_pence) : null,
        alloy_surcharge_pence: draft.alloy_surcharge_pence ? parseInt(draft.alloy_surcharge_pence) : null,
        chemistry:  Object.fromEntries(CHEM_KEYS.filter(k=>draft.chemistry[k]!=="").map(k=>[k,parseFloat(draft.chemistry[k])])),
        mechanical: Object.fromEntries(MECH_KEYS.filter(k=>draft.mechanical[k]!=="").map(k=>[k,parseFloat(draft.mechanical[k])])),
        conformance: draft.conformance.length ? draft.conformance : null,
      }
      const r = await api.grn.create(company, body)
      setDone(r.grn_no)
      if (r.delivery_advisory) setAdvisory(r.delivery_advisory)
    } catch (e: unknown) { setError(String(e)) }
    finally { setSaving(false) }
  }

  if (done) return (
    <div className="dispatch-header" style={{ padding: "2rem" }}>
      <div className="dispatch-ok">GRN {done} confirmed and saved.</div>
      {advisory && (
        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.9rem",
          background: advisory.status === "over" ? "var(--red-bg,#fdecea)" : advisory.status === "exact" ? "var(--green-bg,#e8f5e9)" : "var(--bg,#f5f5f5)",
          border: `1px solid ${advisory.status === "over" ? "var(--red-border,#f5c6cb)" : advisory.status === "exact" ? "var(--green-border,#c8e6c9)" : "var(--border,#e0e0e0)"}`,
          color: advisory.status === "over" ? "var(--red,#c0392b)" : advisory.status === "exact" ? "var(--green,#2e7d32)" : "var(--text,#333)" }}>
          {advisory.status === "exact" && <>PO line fully received — ordered {advisory.ordered}, received {advisory.received_total}</>}
          {advisory.status === "under" && <>Partial delivery — {advisory.outstanding} still outstanding of {advisory.ordered} ordered</>}
          {advisory.status === "over" && <>Over-delivery — received {advisory.received_total} against {advisory.ordered} ordered ({advisory.outstanding} excess)</>}
        </div>
      )}
      <button className="action-btn" style={{ marginTop: "1rem" }}
        onClick={() => location.hash = `#/${company}/grn`}>Back to GRNs</button>
    </div>
  )

  return (
    <div className="grn-shell">
      <h2 className="grn-title">New GRN — AI Extraction</h2>

      {!draft && (
        <div className="grn-upload">
          <p className="grn-hint">Upload mill certificate(s) and/or delivery note as PDF. Claude will extract the batch data for you to review.</p>
          <input type="file" accept="application/pdf" multiple
            onChange={e => setFiles(Array.from(e.target.files ?? []))}
            className="grn-file-input" />
          {files.length > 0 && (
            <p className="grn-files">{files.map(f=>f.name).join(", ")}</p>
          )}
          <div style={{ marginTop: "1rem" }}>
            <button className="dispatch-submit-btn" disabled={!files.length || extracting}
              onClick={extract}>
              {extracting ? "Extracting…" : `Extract from ${files.length} PDF${files.length!==1?"s":""}`}
            </button>
            <button className="action-btn" style={{ marginLeft: "0.5rem" }}
              onClick={() => setDraft(emptyDraft())}>Enter manually</button>
          </div>
          {error && <p className="grn-error">{error}</p>}
        </div>
      )}

      {duplicateDN && (
        <div className="gate-msg gate-msg--warn" style={{ marginBottom: "0.75rem" }}>
          Warning: a GRN with this delivery note reference already exists. Check for duplicate receipt.
        </div>
      )}

      {!suggestedPO && poCandidates.length > 0 && (
        <div className="grn-section" style={{ background: "var(--color-surface-2)", borderRadius: "6px", padding: "1rem", marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>No PO number found — open POs from this supplier</h3>
          <p style={{ fontSize: "0.85em", margin: "0 0 0.5rem" }}>Select the matching PO to pre-fill the form:</p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {poCandidates.map(c => (
              <button key={c.order_no} onClick={() => {
                setSuggestedPO(c)
                set("purchase_order_no", c.order_no)
                set("supplier_account", c.supplier_account)
              }}>{c.order_no}</button>
            ))}
          </div>
        </div>
      )}

      {suggestedPO && (
        <div className="grn-section" style={{ background: "var(--color-surface-2)", borderRadius: "6px", padding: "1rem", marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Matched Purchase Order — {suggestedPO.order_no} ({suggestedPO.supplier_account})</h3>
          <table style={{ width: "100%", fontSize: "0.85em" }}>
            <thead><tr><th>Stock code</th><th>Description</th><th className="r">Ordered</th><th className="r">Received</th><th>Status</th></tr></thead>
            <tbody>
              {suggestedPO.lines.map((l, i) => (
                <tr key={i}>
                  <td><code>{l.stock_account_code}</code></td>
                  <td>{l.description}</td>
                  <td className="r">{l.qty_ordered}</td>
                  <td className="r">{l.qty_received}</td>
                  <td><Badge value={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <div className="grn-form">
          {error && <p className="grn-error">{error}</p>}

          <section className="grn-section">
            <h3>Receipt details</h3>
            <div className="grn-grid">
              {([
                ["Supplier account",   "supplier_account"],
                ["PO number",          "purchase_order_no"],
                ["Delivery note ref",  "delivery_note_ref"],
                ["Stock code",         "stock_account_code"],
                ["Cert ref",           "cert_ref"],
                ["Warehouse",          "warehouse"],
              ] as [string, keyof GRNDraft][]).map(([label, field]) => (
                <label key={field} className="grn-label">
                  {label}
                  <input className="grn-input" value={draft[field] as string}
                    onChange={e => set(field, e.target.value)} />
                </label>
              ))}
              <label className="grn-label">Manufacturer (mill) account
                <SupplierPicker company={company} value={draft.manufacturer_account}
                  onChange={v => set("manufacturer_account", v)} /></label>
              <label className="grn-label">Manufacturer name
                <input className="grn-input" value={draft.manufacturer_name}
                  onChange={e => set("manufacturer_name", e.target.value)} /></label>
              <label className="grn-label">Country of origin
                <input className="grn-input" value={draft.country_of_origin}
                  onChange={e => set("country_of_origin", e.target.value)} placeholder="e.g. Germany" /></label>
            </div>
            <div className="grn-grid">
              <label className="grn-label">Quantity
                <input className="grn-input" value={draft.quantity} onChange={e=>set("quantity",e.target.value)} /></label>
              <label className="grn-label">Unit
                <input className="grn-input" value={draft.unit} onChange={e=>set("unit",e.target.value)} /></label>
              <label className="grn-label">Length (mm)
                <input className="grn-input" value={draft.length_mm} onChange={e=>set("length_mm",e.target.value)} /></label>
            </div>
          </section>

          <section className="grn-section">
            <h3>Material / cert</h3>
            <div className="grn-grid">
              {([
                ["Heat no",      "heat_no"],
                ["Spec",         "spec"],
                ["Grade",        "grade"],
                ["Cert standard","cert_standard"],
              ] as [string, keyof GRNDraft][]).map(([label, field]) => (
                <label key={field} className="grn-label">
                  {label}
                  <input className="grn-input" value={draft[field] as string}
                    onChange={e => set(field, e.target.value)} />
                </label>
              ))}
            </div>
          </section>

          <section className="grn-section">
            <h3>Pricing</h3>
            <div className="grn-grid">
              <label className="grn-label">Price (pence per unit)
                <input className="grn-input" value={draft.price_pence} onChange={e=>set("price_pence",e.target.value)} /></label>
              <label className="grn-label">Price basis
                <select className="grn-input" value={draft.price_basis} onChange={e=>set("price_basis",e.target.value)}>
                  <option value="T">Per tonne (T)</option>
                  <option value="M">Per metre (M)</option>
                  <option value="EA">Each (EA)</option>
                </select></label>
              <label className="grn-label">Alloy surcharge (pence/unit)
                <input className="grn-input" value={draft.alloy_surcharge_pence} onChange={e=>set("alloy_surcharge_pence",e.target.value)} /></label>
            </div>
          </section>

          <section className="grn-section">
            <h3>Chemistry</h3>
            <div className="grn-grid grn-grid--wide">
              {CHEM_KEYS.map(k => (
                <label key={k} className="grn-label">
                  {k}
                  <input className="grn-input grn-input--narrow" value={draft.chemistry[k]}
                    onChange={e => setChem(k, e.target.value)} />
                </label>
              ))}
            </div>
          </section>

          <section className="grn-section">
            <h3>Mechanical properties</h3>
            <div className="grn-grid">
              {MECH_KEYS.map(k => (
                <label key={k} className="grn-label">
                  {k.replace(/_/g," ")}
                  <input className="grn-input" value={draft.mechanical[k]}
                    onChange={e => setMech(k, e.target.value)} />
                </label>
              ))}
            </div>
          </section>

          {draft.conformance.length > 0 && (
            <section className="grn-section">
              <h3>
                Spec conformance&nbsp;
                {draft.conformance.every(r => r.pass)
                  ? <span className="badge badge--pass">PASS</span>
                  : <span className="badge badge--fail">FAIL</span>}
              </h3>
              <table className="conform-table">
                <thead><tr>
                  <th>Element</th><th>Cert value</th><th>Lower limit</th><th>Upper limit</th><th>Result</th>
                </tr></thead>
                <tbody>
                  {draft.conformance.map(r => (
                    <tr key={r.element} className={r.pass ? "conform-pass" : "conform-fail"}>
                      <td>{r.element}</td>
                      <td>{r.cert_value}</td>
                      <td>{r.lower ?? "—"}</td>
                      <td>{r.upper ?? "—"}</td>
                      <td>{r.pass ? "✓ PASS" : "✗ FAIL"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <div className="grn-actions">
            <button className="dispatch-submit-btn" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Confirm GRN"}
            </button>
            <button className="action-btn" style={{ marginLeft: "0.5rem" }}
              onClick={() => setDraft(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Mill Test Certificates ────────────────────────────────────────────────────

export function MTCList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [unmatched, setUnmatched] = useState(false)
  const q = useDebounce(search, 300)
  const { data: rows, loading, error } = useData<Mtc[]>(
    () => api.mtcs.list(company, { search: q, unmatched }), [company, q, unmatched]
  )

  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Mill Test Certificates">
        <SearchBar value={search} onChange={setSearch} />
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={unmatched} onChange={e => setUnmatched(e.target.checked)} />
          Unmatched only (no linked batch)
        </label>
      </Toolbar>
      <table>
        <thead><tr>
          <th>Cert Ref</th><th>Heat No</th><th>Grade</th><th>Standard</th>
          <th>Supplier</th><th>Batches</th><th>PDFs</th><th>Verified</th>
        </tr></thead>
        <tbody>
          {rows?.map(r => (
            <tr key={r.id} className="row-link"
              onClick={() => location.hash = `#/${company}/mtcs/${r.id}`}>
              <td><strong className="row-link-id">{r.cert_reference || `MTC-${r.id}`}</strong></td>
              <td>{r.heat_number}</td>
              <td>{r.grade_code}</td>
              <td>{r.standard}</td>
              <td>{r.supplier_account}</td>
              <td>{r.batch_count === 0
                ? <span className="badge badge--fail">unmatched</span>
                : r.batch_count}</td>
              <td>{r.cert_count}</td>
              <td>{r.verified_at
                ? <span className="badge badge--pass">✓</span>
                : "—"}</td>
            </tr>
          ))}
          {(!rows || rows.length === 0) && <tr><td colSpan={8} className="state-msg">No certificates.</td></tr>}
        </tbody>
      </table>
    </Shell>
  )
}

export function MTCDetail({ company, id }: { company: string; id: string }) {
  const mtcId = Number(id)
  const [rev, setRev] = useState(0)
  const { data: mtc, loading, error } = useData(() => api.mtcs.get(company, mtcId), [company, mtcId, rev])
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null)
  const [matchBatch, setMatchBatch] = useState("")
  const [matchPrimary, setMatchPrimary] = useState(false)
  const [matchMsg, setMatchMsg] = useState<string | null>(null)
  const [aiExtracting, setAiExtracting] = useState(false)
  const [aiResult, setAiResult] = useState<import("./api").MtcAiExtraction | null>(null)
  const [aiConfirming, setAiConfirming] = useState(false)
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  const chemKeys = mtc?.chemistry ? CHEM_KEYS.filter(k => mtc.chemistry![k] != null) : []
  const mechKeys = mtc?.mechanical ? MECH_KEYS.filter(k => mtc.mechanical![k] != null) : []
  const verified = verifiedAt ?? mtc?.verified_at ?? null

  async function viewCerts() {
    try {
      const certs = await api.mtcs.certs(company, mtcId)
      if (certs.length === 0) return
      certs.forEach(c => window.open(c.url, "_blank", "noopener"))
    } catch (e) { console.error(e) }
  }

  async function verify() {
    try {
      const r = await api.mtcs.verify(company, mtcId)
      setVerifiedAt(r.verified_at)
    } catch (e) { console.error(e) }
  }

  async function matchToBatch() {
    const bn = matchBatch.trim().toUpperCase()
    if (!bn) return
    try {
      await api.mtcs.match(company, mtcId, bn, matchPrimary)
      setMatchMsg(`Linked to ${bn}`); setMatchBatch(""); setRev(r => r + 1)
    } catch (e) { setMatchMsg(String(e)) }
  }

  return (
    <Shell loading={loading} error={error}>
      <a className="back-link" href={`#/${company}/mtcs`}>← Back to certificates</a>
      {mtc && (
        <div className="grn-shell">
          <div className="detail-grid">
            <div className="detail-card">
              <h3>Certificate</h3>
              <dl>
                <dt>Cert Ref</dt><dd>{mtc.cert_reference || "—"}</dd>
                <dt>Type</dt><dd>{mtc.cert_type || "—"}</dd>
                <dt>Standard</dt><dd>{mtc.standard || "—"}</dd>
                <dt>Mill</dt><dd>{mtc.mill_name
                  ? mtc.mill_name
                  : mtc.supplier_account
                    ? <a href={`#/${company}/suppliers/${encodeURIComponent(mtc.supplier_account)}`}>{mtc.supplier_account}</a>
                    : "—"}</dd>
                <dt>Cert date</dt><dd>{mtc.cert_date?.slice(0,10) || "—"}</dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Material</h3>
              <dl>
                <dt>Heat No</dt><dd>{mtc.heat_number || "—"}</dd>
                <dt>Grade</dt><dd>{mtc.grade_code || "—"}</dd>
                <dt>Description</dt><dd>{mtc.material_description || "—"}</dd>
                <dt>Heat treatment</dt><dd>{mtc.heat_treatment_condition || "—"}</dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Status</h3>
              <dl>
                <dt>Verified</dt><dd>{verified
                  ? <span className="badge badge--pass">{verified.slice(0,10)}{mtc.verified_by ? ` · ${mtc.verified_by}` : ""}</span>
                  : <span className="badge badge--fail">unverified</span>}</dd>
                <dt>Source</dt><dd>{mtc.ocr_extracted ? "AI-extracted" : "Manual"}</dd>
                <dt>Linked batches</dt><dd>{mtc.batches.length}</dd>
              </dl>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            {(mtc.cert_paths?.length ?? 0) > 0 &&
              <button className="action-btn" onClick={viewCerts}>View cert PDF ({mtc.cert_paths!.length})</button>}
            {(mtc.cert_paths?.length ?? 0) > 0 && (
              <button className="action-btn" disabled={aiExtracting} onClick={async () => {
                setAiExtracting(true); setAiResult(null); setAiMsg(null)
                try { setAiResult(await api.mtcs.aiExtract(company, mtcId)) }
                catch (e) { setAiMsg(String(e)) }
                finally { setAiExtracting(false) }
              }}>{aiExtracting ? "Extracting…" : "Extract with AI"}</button>
            )}
            {!verified && <button className="action-btn" onClick={verify}>Mark verified</button>}
          </div>
          {aiMsg && <p style={{ color: "var(--color-fail,#c00)", fontSize: "0.85rem" }}>{aiMsg}</p>}
          {aiResult && (
            <div style={{ marginBottom: "1rem", padding: "1rem", background: "var(--color-surface-alt,#f7fafc)", borderRadius: "8px", border: "1px solid var(--color-border,#e2e8f0)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <strong style={{ fontSize: "0.9rem" }}>AI Extraction Results</strong>
                {aiResult.extraction_uncertain && (
                  <span style={{ fontSize: "0.78rem", color: "#a06000", fontWeight: 600 }}>⚠ Some fields uncertain</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
                {Object.entries(aiResult.extracted)
                  .filter(([k]) => !["chemistry","mechanical","confidence","extraction_uncertain"].includes(k))
                  .map(([k, v]) => {
                    const conf = aiResult.extracted.confidence?.[k] ?? 1
                    const bg = conf >= 0.85 ? "#f0fff4" : conf >= 0.70 ? "#fffbeb" : "#fff5f5"
                    return (
                      <div key={k} style={{ padding: "0.4rem 0.6rem", borderRadius: "4px", background: bg, fontSize: "0.8rem" }}>
                        <div style={{ color: "#718096", fontSize: "0.72rem", textTransform: "uppercase" }}>{k.replace(/_/g," ")}</div>
                        <strong>{String(v || "—")}</strong>
                        <div style={{ fontSize: "0.68rem", color: conf >= 0.85 ? "#38a169" : conf >= 0.70 ? "#d69e2e" : "#e53e3e" }}>{(conf * 100).toFixed(0)}%</div>
                      </div>
                    )
                  })}
              </div>
              {aiResult.extracted.chemistry && Object.keys(aiResult.extracted.chemistry).length > 0 && (
                <div style={{ fontSize: "0.82rem", marginBottom: "0.5rem" }}>
                  <strong>Chemistry: </strong>
                  {Object.entries(aiResult.extracted.chemistry).map(([k,v]) => `${k}: ${v}`).join(" · ")}
                </div>
              )}
              {aiResult.extracted.mechanical && Object.keys(aiResult.extracted.mechanical).length > 0 && (
                <div style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
                  <strong>Mechanical: </strong>
                  {Object.entries(aiResult.extracted.mechanical).map(([k,v]) => `${k}: ${v}`).join(" · ")}
                </div>
              )}
              <p style={{ fontSize: "0.78rem", color: "#718096", marginBottom: "0.5rem" }}>
                Accepting this extraction will NOT set the Verified status — manual verification is still required.
              </p>
              <button className="action-btn" disabled={aiConfirming} onClick={async () => {
                setAiConfirming(true); setAiMsg(null)
                const fields: Record<string, unknown> = {}
                const ex = aiResult.extracted
                for (const k of ["cert_reference","heat_number","cert_type","grade_code","standard","material_description","cert_date","test_date","mill_name","authorised_by","inspected_by","heat_treatment_condition"]) {
                  if (ex[k as keyof typeof ex]) fields[k] = ex[k as keyof typeof ex]
                }
                if (ex.chemistry && Object.keys(ex.chemistry).length > 0) fields.chemistry = ex.chemistry
                if (ex.mechanical && Object.keys(ex.mechanical).length > 0) fields.mechanical = ex.mechanical
                try {
                  await api.mtcs.aiConfirm(company, mtcId, fields)
                  setAiResult(null); setRev(r => r + 1); setAiMsg("AI extraction applied. Verify manually to complete.")
                } catch (e) { setAiMsg(String(e)) }
                finally { setAiConfirming(false) }
              }}>{aiConfirming ? "Applying…" : "Confirm Extraction"}</button>
            </div>
          )}

          <div className="grn-section" style={{ marginBottom: "1rem" }}>
            <h3>Link to batch</h3>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input value={matchBatch} onChange={e => setMatchBatch(e.target.value)}
                placeholder="Batch no (e.g. B000123)" style={{ width: "14em" }}
                onKeyDown={e => { if (e.key === "Enter") matchToBatch() }} />
              <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
                <input type="checkbox" checked={matchPrimary} onChange={e => setMatchPrimary(e.target.checked)} />
                Primary cert
              </label>
              <button className="action-btn" onClick={matchToBatch} disabled={!matchBatch.trim()}>Link</button>
              {matchMsg && <span style={{ fontSize: "0.85rem" }}>{matchMsg}</span>}
            </div>
          </div>

          {chemKeys.length > 0 && (
            <div className="grn-section" style={{ marginBottom: "1rem" }}>
              <h3>Chemistry</h3>
              <table className="conform-table">
                <thead><tr>{chemKeys.map(k => <th key={k}>{k}</th>)}</tr></thead>
                <tbody><tr>{chemKeys.map(k => <td key={k}>{mtc.chemistry![k]}</td>)}</tr></tbody>
              </table>
            </div>
          )}

          {mechKeys.length > 0 && (
            <div className="grn-section" style={{ marginBottom: "1rem" }}>
              <h3>Mechanical</h3>
              <table className="conform-table">
                <thead><tr>{mechKeys.map(k => <th key={k}>{k.replace(/_/g," ")}</th>)}</tr></thead>
                <tbody><tr>{mechKeys.map(k => <td key={k}>{mtc.mechanical![k]}</td>)}</tr></tbody>
              </table>
            </div>
          )}

          {mtc.conformance.length > 0 && (
            <div className="grn-section" style={{ marginBottom: "1rem" }}>
              <h3>Spec conformance &nbsp;
                {mtc.conformance.every(r => r.pass)
                  ? <span className="badge badge--pass">PASS</span>
                  : <span className="badge badge--fail">FAIL</span>}
              </h3>
              <table className="conform-table">
                <thead><tr><th>Element</th><th>Cert value</th><th>Lower</th><th>Upper</th><th>Result</th></tr></thead>
                <tbody>
                  {mtc.conformance.map(r => (
                    <tr key={r.element} className={r.pass ? "conform-pass" : "conform-fail"}>
                      <td>{r.element}</td><td>{r.cert_value}</td>
                      <td>{r.lower ?? "—"}</td><td>{r.upper ?? "—"}</td>
                      <td>{r.pass ? "✓ PASS" : "✗ FAIL"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mtc.batches.length > 0 && (
            <div className="grn-section">
              <h3>Linked batches</h3>
              <table>
                <thead><tr><th>Batch</th><th>Heat</th><th>Available</th><th>Status</th><th>Primary</th></tr></thead>
                <tbody>
                  {mtc.batches.map(b => (
                    <tr key={b.batch_no}>
                      <td><a href={`#/${company}/batches/${encodeURIComponent(b.batch_no)}`}>{b.batch_no}</a></td>
                      <td>{b.heat_no}</td>
                      <td>{b.qty_available}</td><td>{b.status}</td>
                      <td>{b.is_primary ? "✓" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

// ── Remnant register — child batches (offcuts) available as stock ─────────────

export function RemnantRegister({ company }: { company: string }) {
  const [rows, setRows] = useState<StockBatch[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.batches.list(company, { remnants_only: true, status: "available" })
      .then(setRows).catch(() => setRows([])).finally(() => setLoading(false))
  }, [company])
  if (loading) return <p className="state-msg">Loading…</p>
  if (!rows.length) return <p className="state-msg">No remnants in stock.</p>
  return (
    <div>
      <h2 className="page-h2">Remnant Register</h2>
      <p style={{ color: "var(--color-text-muted,#888)", marginBottom: "1rem" }}>
        Offcut batches created from cutting operations, available as stock.
      </p>
      <table className="data-table">
        <thead><tr>
          <th>Batch</th><th>Parent batch</th><th>Stock code</th>
          <th>Heat no.</th><th>Grade</th><th>Length (mm)</th>
          <th>Qty avail.</th><th>Weight (kg)</th><th>Warehouse</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.batch_no} onClick={() => location.hash = `#/${company}/batches/${encodeURIComponent(r.batch_no)}`}
                style={{ cursor: "pointer" }}>
              <td><a href={`#/${company}/batches/${encodeURIComponent(r.batch_no)}`}>{r.batch_no}</a></td>
              <td>{r.parent_batch_id ?? "—"}</td>
              <td>{r.stock_account_code ?? "—"}</td>
              <td>{r.heat_no}</td>
              <td>{r.grade ?? "—"}</td>
              <td>{r.length_mm != null ? r.length_mm.toFixed(0) : "—"}</td>
              <td>{r.qty_available}</td>
              <td>{r.weight_theoretical_kg != null ? r.weight_theoretical_kg.toFixed(2) : "—"}</td>
              <td>{r.warehouse ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Stock batch detail (genealogy + certs + transfer) ─────────────────────────

export function StockBatchDetail({ company, id }: { company: string; id: string }) {
  const [rev, setRev] = useState(0)
  const { data: b, loading, error } = useData(() => api.batches.get(company, id), [company, id, rev])
  const [wh, setWh] = useState("")
  const [adjQty, setAdjQty] = useState("")
  const [adjNotes, setAdjNotes] = useState("")
  const [batchStatus, setBatchStatus] = useState<"available" | "quarantine" | "on_hold">("available")
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (b?.status && ["available", "quarantine", "on_hold"].includes(b.status))
      setBatchStatus(b.status as "available" | "quarantine" | "on_hold")
  }, [b?.status])

  async function transfer() {
    if (!wh.trim()) return
    try {
      const r = await api.batches.transfer(company, id, wh.trim())
      setMsg(`Moved to ${r.warehouse}`); setWh(""); setRev(r2 => r2 + 1)
    } catch (e) { setMsg(String(e)) }
  }

  async function adjust() {
    const q = parseFloat(adjQty)
    if (isNaN(q) || q < 0) { setMsg("Enter a valid non-negative quantity"); return }
    try {
      const r = await api.batches.adjust(company, id, q, adjNotes.trim() || undefined)
      const sign = r.delta >= 0 ? "+" : ""
      setMsg(`Adjusted: qty now ${r.qty_available} (${sign}${r.delta.toFixed(3)})`)
      setAdjQty(""); setAdjNotes(""); setRev(r2 => r2 + 1)
    } catch (e) { setMsg(String(e)) }
  }

  return (
    <Shell loading={loading} error={error}>
      <a className="back-link" href={`#/${company}/batches`}>← Back to batches</a>
      {b && (
        <div className="grn-shell">
          <div className="detail-grid">
            <div className="detail-card">
              <h3>Batch {b.batch_no}</h3>
              <dl>
                <dt>Heat No</dt><dd>{b.heat_no || "—"}</dd>
                <dt>Grade</dt><dd>{b.grade || "—"}</dd>
                <dt>Spec</dt><dd>{b.spec || "—"}</dd>
                <dt>Cert Ref</dt><dd>{b.cert_ref || "—"}</dd>
                <dt>GRN</dt><dd>{b.grn_no
                  ? <a href={`#/${company}/grn/${encodeURIComponent(b.grn_no)}`}>{b.grn_no}</a>
                  : "—"}</dd>
                <dt>Status</dt><dd><Badge value={b.status} /></dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Quantity / weight</h3>
              <dl>
                <dt>Received</dt><dd>{b.qty_received} {b.unit}</dd>
                <dt>Available</dt><dd>{b.qty_available} {b.unit}</dd>
                <dt>Length</dt><dd>{b.length_mm != null ? `${b.length_mm} mm` : "—"}</dd>
                <dt>Theoretical</dt><dd>{b.weight_theoretical_kg != null ? `${b.weight_theoretical_kg} kg` : "—"}</dd>
                <dt>Actual</dt><dd>{b.weight_actual_kg != null ? `${b.weight_actual_kg} kg` : "—"}</dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Origin</h3>
              <dl>
                <dt>Warehouse</dt><dd>{b.warehouse || "—"}</dd>
                <dt>Created</dt><dd>{b.created_at?.slice(0, 10)}</dd>
                {b.manufacturer_account && <>
                  <dt>Manufacturer</dt><dd>
                    <a href={`#/${company}/suppliers/${encodeURIComponent(b.manufacturer_account)}`}>
                      {b.manufacturer_name || b.manufacturer_account}
                    </a>
                  </dd>
                </>}
                {b.country_of_origin && <>
                  <dt>Country</dt><dd>{b.country_of_origin}</dd>
                </>}
                <dt>On orders</dt><dd>{b.qty_allocated > 0 ? `${b.qty_allocated} ${b.unit}` : "—"}</dd>
                <dt>Free qty</dt><dd>{(b.qty_available - (b.qty_allocated ?? 0))} {b.unit}</dd>
              </dl>
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.4rem" }}>
                <input placeholder="Transfer to warehouse" value={wh} onChange={e => setWh(e.target.value)} />
                <button className="action-btn" onClick={transfer}>Transfer</button>
              </div>
              {b.status === "available" && b.qty_available > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  <a className="action-btn" href={`#/${company}/works-orders/new?batch=${encodeURIComponent(b.batch_no)}`}>New works order →</a>
                </div>
              )}
              {!["allocated", "despatched"].includes(b.status) && (
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <select value={batchStatus} onChange={e => setBatchStatus(e.target.value as "available" | "quarantine" | "on_hold")} style={{ fontSize: "0.85rem" }}>
                    <option value="available">available</option>
                    <option value="quarantine">quarantine</option>
                    <option value="on_hold">on_hold</option>
                  </select>
                  <button onClick={async () => {
                    try { await api.batches.setStatus(company, b.batch_no, batchStatus); setRev(r => r + 1); setMsg(`Status → ${batchStatus}`) }
                    catch (e) { setMsg(String(e)) }
                  }}>Set status</button>
                </div>
              )}
              {msg && <span className="badge" style={{ marginTop: "0.4rem", display: "inline-block" }}>{msg}</span>}
            </div>
          </div>

          <div className="grn-section" style={{ marginBottom: "1rem" }}>
            <h3>Genealogy</h3>
            {b.genealogy.parents.length === 0 && b.genealogy.children.length === 0 ? (
              <p className="state-msg">Original mill batch — no cuts recorded.</p>
            ) : (
              <>
                {b.genealogy.parents.length > 0 && (
                  <p>Cut from:{" "}
                    {b.genealogy.parents.map(p => (
                      <a key={p.id} href={`#/${company}/batches/${p.parent_batch_no}`} style={{ marginRight: "0.6rem" }}>
                        {p.parent_batch_no} ({p.quantity_from_parent})
                      </a>
                    ))}
                  </p>
                )}
                {b.genealogy.children.length > 0 && (
                  <table className="conform-table">
                    <thead><tr><th>Child batch</th><th>Qty from parent</th><th>Weight (kg)</th><th>When</th></tr></thead>
                    <tbody>
                      {b.genealogy.children.map(c => (
                        <tr key={c.id}>
                          <td><a href={`#/${company}/batches/${c.child_batch_no}`}>{c.child_batch_no}</a></td>
                          <td>{c.quantity_from_parent}</td>
                          <td>{c.weight_from_parent_kg ?? "—"}</td>
                          <td>{c.created_at?.slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>

          {b.status === "available" && (
            <div className="grn-section" style={{ marginBottom: "1rem" }}>
              <h3>Stock-take adjustment</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
                Set the new physical quantity for this batch. Updates stock item qty and logs an adjustment transaction.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <input type="number" min={0} step="0.001" placeholder={`New qty (was ${b.qty_available})`}
                  value={adjQty} onChange={e => setAdjQty(e.target.value)} style={{ width: "10em" }} />
                <input placeholder="Notes (optional)" value={adjNotes} onChange={e => setAdjNotes(e.target.value)} style={{ width: "16em" }} />
                <button className="action-btn" onClick={adjust} disabled={!adjQty}>Adjust</button>
              </div>
            </div>
          )}

          {b.mtcs.length > 0 && (
            <div className="grn-section">
              <h3>Certificates</h3>
              <table>
                <thead><tr><th>Cert Ref</th><th>Heat</th><th>Grade</th><th>Verified</th></tr></thead>
                <tbody>
                  {b.mtcs.map(m => (
                    <tr key={m.id} className="row-link" onClick={() => location.hash = `#/${company}/mtcs/${m.id}`}>
                      <td>{m.cert_reference || `MTC-${m.id}`}</td>
                      <td>{m.heat_number}</td><td>{m.grade_code}</td>
                      <td>{m.verified_at ? <span className="badge badge--pass">✓</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

// ── Quotes (with AI-PDF entry) ────────────────────────────────────────────────

export function QuoteList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const q = useDebounce(search, 300)
  const { data, loading, error } = useData<Quote[]>(
    () => api.quotes.list(company, q, statusFilter), [company, q, statusFilter]
  )
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Quotes">
        <SearchBar value={search} onChange={setSearch} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ fontSize: "0.85rem" }}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="converted">Converted</option>
          <option value="expired">Expired</option>
        </select>
        <button className="action-btn" onClick={() => location.hash = `#/${company}/quotes/new`}>+ New Quote</button>
      </Toolbar>
      <table>
        <thead><tr>
          <th>Quote No</th><th>Customer</th><th>Date</th><th>Valid until</th>
          <th className="r">Net</th><th className="r">Total</th><th>Status</th><th>SO</th>
        </tr></thead>
        <tbody>
          {data?.map(r => {
            const expired = r.valid_until && r.valid_until.slice(0, 10) < today && !r.converted_so_no && r.status === "open"
            return (
              <tr key={r.quote_no} className="row-link" onClick={() => location.hash = `#/${company}/quotes/${encodeURIComponent(r.quote_no)}`}>
                <td><strong className="row-link-id">{r.quote_no}</strong></td>
                <td>{r.customer_name || r.customer_account || "—"}</td>
                <td>{r.quote_date?.slice(0, 10) || "—"}</td>
                <td style={expired ? { color: "var(--color-fail,#c00)", fontWeight: 600 } : undefined}>
                  {r.valid_until?.slice(0, 10) || "—"}{expired ? " (expired)" : ""}
                </td>
                <td className="r">{fmtGbp(r.net_gbp)}</td>
                <td className="r">{fmtGbp(r.total_gbp)}</td>
                <td><Badge value={r.status} /></td>
                <td>{r.converted_so_no || "—"}</td>
              </tr>
            )
          })}
          {(!data || data.length === 0) && <tr><td colSpan={8} className="state-msg">No quotes yet.</td></tr>}
        </tbody>
      </table>
    </Shell>
  )
}

type QLineDraft = QuoteExtractLine & { unit_price?: string }

export function QuoteNew({ company }: { company: string }) {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [customer, setCustomer] = useState("")
  const [lines, setLines] = useState<QLineDraft[]>([])

  async function extract() {
    if (files.length === 0) return
    setBusy(true); setErr(null)
    try {
      const r = await api.quotes.extract(company, files)
      setCustomer(r.extracted.customer_ref || "")
      setLines((r.extracted.lines || []).map(l => ({ ...l, unit_price: "" })))
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  function addLine() {
    setLines([...lines, { description: "", grade: "", product_form: "plate", qty: 1, unit_price: "" }])
  }
  function setLine(i: number, patch: Partial<QLineDraft>) {
    setLines(lines.map((l, j) => j === i ? { ...l, ...patch } : l))
  }

  async function save() {
    setBusy(true); setErr(null)
    try {
      const body = {
        customer_account: customer.trim() || undefined,
        lines: lines.map(l => ({
          description: l.description, grade: l.grade, spec: l.spec, product_form: l.product_form,
          length_mm: l.length_mm ?? undefined, width_mm: l.width_mm ?? undefined,
          thickness_mm: l.thickness_mm ?? undefined, diameter_mm: l.diameter_mm ?? undefined,
          qty: Number(l.qty) || 0, unit: l.unit, required_cert_type: l.required_cert_type || undefined,
          unit_price: l.unit_price ? Math.round(parseFloat(l.unit_price) * 100) : undefined,
        })),
      }
      const r = await api.quotes.create(company, body)
      location.hash = `#/${company}/quotes/${encodeURIComponent(r.quote_no)}`
    } catch (e) { setErr(String(e)); setBusy(false) }
  }

  return (
    <Shell loading={false} error={null}>
      <a className="back-link" href={`#/${company}/quotes`}>← Quotes</a>
      <Toolbar title="New Quote" />
      <div className="grn-section" style={{ marginBottom: "1rem" }}>
        <h3>Populate from a customer PDF (enquiry / PO)</h3>
        <input type="file" multiple accept="application/pdf,image/*"
          onChange={e => setFiles(Array.from(e.target.files ?? []))} />
        <button className="action-btn" style={{ marginLeft: "0.5rem" }} disabled={busy || files.length === 0} onClick={extract}>
          {busy ? "Reading…" : "Extract with AI"}
        </button>
        {err && <span className="badge badge--fail" style={{ marginLeft: "0.5rem" }}>{err}</span>}
      </div>

      <div style={{ marginBottom: "0.75rem" }}>
        <label>Customer account&nbsp;</label>
        <CustomerPicker company={company} value={customer} onChange={setCustomer} />
      </div>

      <table>
        <thead><tr>
          <th>Description</th><th>Grade</th><th>Form</th><th>L</th><th>W</th><th>T</th><th>Ø</th>
          <th>Qty</th><th>Theo kg</th><th>Unit £</th><th>Cert</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><input value={l.description ?? ""} onChange={e => setLine(i, { description: e.target.value })} /></td>
              <td><input style={{ width: "5em" }} value={l.grade ?? ""} onChange={e => setLine(i, { grade: e.target.value })} /></td>
              <td><input style={{ width: "5em" }} value={l.product_form ?? ""} onChange={e => setLine(i, { product_form: e.target.value })} /></td>
              <td><input style={{ width: "4em" }} value={l.length_mm ?? ""} onChange={e => setLine(i, { length_mm: e.target.value ? Number(e.target.value) : null })} /></td>
              <td><input style={{ width: "4em" }} value={l.width_mm ?? ""} onChange={e => setLine(i, { width_mm: e.target.value ? Number(e.target.value) : null })} /></td>
              <td><input style={{ width: "4em" }} value={l.thickness_mm ?? ""} onChange={e => setLine(i, { thickness_mm: e.target.value ? Number(e.target.value) : null })} /></td>
              <td><input style={{ width: "4em" }} value={l.diameter_mm ?? ""} onChange={e => setLine(i, { diameter_mm: e.target.value ? Number(e.target.value) : null })} /></td>
              <td><input style={{ width: "4em" }} value={l.qty ?? ""} onChange={e => setLine(i, { qty: e.target.value ? Number(e.target.value) : null })} /></td>
              <td>{l.weight_theoretical_kg ?? "—"}</td>
              <td><input style={{ width: "5em" }} value={l.unit_price ?? ""} onChange={e => setLine(i, { unit_price: e.target.value })} /></td>
              <td><input style={{ width: "3.5em" }} value={l.required_cert_type ?? ""} onChange={e => setLine(i, { required_cert_type: e.target.value })} /></td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={11} className="state-msg">Extract from a PDF, or add a line.</td></tr>}
        </tbody>
      </table>
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
        <button onClick={addLine}>+ Add line</button>
        <button className="action-btn" disabled={busy || lines.length === 0} onClick={save}>
          {busy ? "Saving…" : "Save quote"}
        </button>
      </div>
    </Shell>
  )
}

export function QuoteDetail({ company, id }: { company: string; id: string }) {
  const [rev, setRev] = useState(0)
  const { data: q, loading, error } = useData(() => api.quotes.get(company, id), [company, id, rev])
  const [msg, setMsg] = useState<string | null>(null)
  const [soNo, setSoNo] = useState<string | null>(null)

  async function convert() {
    try {
      const r = await api.quotes.convert(company, id)
      setSoNo(r.order_no); setMsg(`Converted to ${r.order_no}`)
    } catch (e) { setMsg(String(e)) }
  }

  async function setStatus(status: "rejected" | "expired") {
    if (!window.confirm(`Mark quote as ${status}?`)) return
    try { await api.quotes.setStatus(company, id, status); setRev(r => r + 1); setMsg(`Quote ${status}`) }
    catch (e) { setMsg(String(e)) }
  }

  const converted = soNo ?? q?.converted_so_no ?? null

  return (
    <Shell loading={loading} error={error}>
      <a className="back-link" href={`#/${company}/quotes`}>← Quotes</a>
      {q && (
        <div className="grn-shell">
          <div className="detail-grid">
            <div className="detail-card">
              <h3>Quote {q.quote_no}</h3>
              <dl>
                <dt>Customer</dt><dd>{q.customer_account
                  ? <a href={`#/${company}/customers/${encodeURIComponent(q.customer_account)}`}>{q.customer_name || q.customer_account}</a>
                  : "—"}</dd>
                <dt>Date</dt><dd>{q.quote_date?.slice(0, 10) || "—"}</dd>
                <dt>Valid until</dt><dd>{q.valid_until?.slice(0, 10) || "—"}</dd>
                <dt>Status</dt><dd><Badge value={converted ? "converted" : q.status} /></dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Amounts</h3>
              <dl>
                <dt>Net</dt><dd>{fmtGbp(q.net_gbp)}</dd>
                <dt>VAT</dt><dd>{fmtGbp(q.vat_gbp)}</dd>
                <dt>Total</dt><dd>{fmtGbp(q.total_gbp)}</dd>
              </dl>
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                {converted
                  ? <a href={`#/${company}/sales-orders/${converted}`}>→ {converted}</a>
                  : q.status === "open"
                    ? <>
                        <button className="action-btn" onClick={convert}>Convert to sales order</button>
                        <button onClick={() => setStatus("rejected")}>Reject</button>
                        <button onClick={() => setStatus("expired")}>Expire</button>
                      </>
                    : <Badge value={q.status} />}
                <button className="action-btn" onClick={async () => { try { window.open(await api.quotes.pdf(company, q.quote_no), "_blank") } catch (e) { setMsg(String(e)) } }}>PDF</button>
                {msg && <span className="badge">{msg}</span>}
              </div>
            </div>
          </div>
          <div className="detail-lines">
            <h3>Lines</h3>
            <table>
              <thead><tr>
                <th>#</th><th>Description</th><th>Grade</th><th>Form</th><th>Dims (mm)</th>
                <th className="r">Qty</th><th className="r">Theo kg</th><th className="r">Unit £</th>
                <th className="r">Total</th><th>Cert</th>
              </tr></thead>
              <tbody>
                {q.lines.map(l => (
                  <tr key={l.line_no}>
                    <td>{l.line_no}</td>
                    <td>{l.description || "—"}</td>
                    <td>{l.grade || "—"}</td>
                    <td>{l.product_form || "—"}</td>
                    <td>{[l.length_mm, l.width_mm, l.thickness_mm, l.diameter_mm].filter(Boolean).join(" × ") || "—"}</td>
                    <td className="r">{l.qty ?? "—"}</td>
                    <td className="r">{l.weight_theoretical_kg ?? "—"}</td>
                    <td className="r">{fmtGbp(l.unit_price_gbp)}</td>
                    <td className="r">{fmtGbp(l.line_total_gbp)}</td>
                    <td>{l.required_cert_type || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  )
}

// ── Works Orders (cutting) ────────────────────────────────────────────────────

const WO_COLUMNS = ["queued", "in_progress", "complete"] as const

export function WorkOrderList({ company }: { company: string }) {
  const [rows, setRows] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.workOrders.list(company).then(setRows).catch(console.error).finally(() => setLoading(false))
  }, [company])

  return (
    <Shell loading={loading} error={null}>
      <Toolbar title="Works Orders">
        <button className="action-btn" onClick={() => location.hash = `#/${company}/works-orders/new`}>+ New Works Order</button>
      </Toolbar>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        {WO_COLUMNS.map(col => (
          <div key={col} style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ textTransform: "capitalize" }}>{col.replace("_", " ")} ({rows.filter(r => r.status === col).length})</h3>
            {rows.filter(r => r.status === col).map(r => (
              <div key={r.wo_no} className="detail-card" style={{ marginBottom: "0.5rem", cursor: "pointer" }}
                onClick={() => location.hash = `#/${company}/works-orders/${encodeURIComponent(r.wo_no)}`}>
                <strong className="row-link-id">{r.wo_no}</strong>
                <div style={{ fontSize: "0.85rem" }}>{r.parent_batch_no} · {r.grade || "—"} · heat {r.heat_no || "—"}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted, #888)" }}>
                  {r.operation_type} · yield {r.actual_yield_pct ?? r.theoretical_yield_pct ?? "—"}%
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  )
}

type CutRow = { length_mm: string; qty: string }

export function WorkOrderNew({ company, initialBatch }: { company: string; initialBatch?: string }) {
  const [parent, setParent] = useState(initialBatch ?? "")
  const [cuts, setCuts] = useState<CutRow[]>([{ length_mm: "", qty: "" }])
  const [kerf, setKerf] = useState("3")
  const [minOff, setMinOff] = useState("300")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    const cutting_list = cuts
      .filter(c => c.length_mm && c.qty)
      .map(c => ({ length_mm: parseFloat(c.length_mm), qty: parseInt(c.qty) }))
    if (!parent.trim() || cutting_list.length === 0) { setErr("Enter a parent batch and at least one cut"); return }
    setBusy(true); setErr(null)
    try {
      const r = await api.workOrders.create(company, {
        parent_batch_no: parent.trim(), cutting_list,
        kerf_mm: parseFloat(kerf) || 0, min_offcut_mm: parseFloat(minOff) || 0,
      })
      location.hash = `#/${company}/works-orders/${encodeURIComponent(r.wo_no)}`
    } catch (e) { setErr(String(e)); setBusy(false) }
  }

  return (
    <Shell loading={false} error={null}>
      <a className="back-link" href={`#/${company}/works-orders`}>← Works Orders</a>
      <Toolbar title="New Works Order" />
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <label>Parent batch&nbsp;<input value={parent} onChange={e => setParent(e.target.value)} placeholder="batch no" /></label>
        <label>Kerf (mm)&nbsp;<input style={{ width: "5em" }} value={kerf} onChange={e => setKerf(e.target.value)} /></label>
        <label>Min offcut (mm)&nbsp;<input style={{ width: "5em" }} value={minOff} onChange={e => setMinOff(e.target.value)} /></label>
      </div>
      <h3>Cutting list</h3>
      <table>
        <thead><tr><th>Length (mm)</th><th>Qty</th></tr></thead>
        <tbody>
          {cuts.map((c, i) => (
            <tr key={i}>
              <td><input value={c.length_mm} onChange={e => setCuts(cuts.map((x, j) => j === i ? { ...x, length_mm: e.target.value } : x))} /></td>
              <td><input value={c.qty} onChange={e => setCuts(cuts.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
        <button onClick={() => setCuts([...cuts, { length_mm: "", qty: "" }])}>+ Add cut</button>
        <button className="action-btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Create works order"}</button>
        {err && <span className="badge badge--fail">{err}</span>}
      </div>
    </Shell>
  )
}

function NestingImportForm({ company, woNo, onDone }: { company: string; woNo: string; onDone: () => void }) {
  const [utilisation, setUtilisation] = useState("")
  const [sheets, setSheets] = useState("1")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api.workOrders.nestingImport(company, woNo, {
        utilisation_pct: parseFloat(utilisation),
        sheets_used: parseInt(sheets, 10),
        notes: notes || undefined,
      })
      onDone()
    } catch (ex) {
      setErr(String(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 340 }}>
      <label>
        Utilisation %
        <input type="number" step="0.1" min="0" max="100" required value={utilisation}
          onChange={e => setUtilisation(e.target.value)} />
      </label>
      <label>
        Sheets used
        <input type="number" min="1" required value={sheets}
          onChange={e => setSheets(e.target.value)} />
      </label>
      <label>
        Notes (optional)
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} />
      </label>
      <button className="action-btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Import results"}</button>
      {err && <span className="badge" style={{ color: "var(--clr-danger)" }}>{err}</span>}
    </form>
  )
}

export function WorkOrderDetail({ company, id }: { company: string; id: string }) {
  const [rev, setRev] = useState(0)
  const { data: w, loading, error } = useData(() => api.workOrders.get(company, id), [company, id, rev])
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function complete() {
    setMsg("Completing…")
    try {
      const r = await api.workOrders.complete(company, id)
      setDone(true)
      setMsg(`Done — ${r.bars_used} bar(s), yield ${r.yield_pct}%, scrap ${r.weight_scrap_kg} kg`)
    } catch (e) { setMsg(String(e)) }
  }

  async function setStatus(s: string) {
    try { await api.workOrders.setStatus(company, id, s); setRev(r => r + 1) }
    catch (e) { setMsg(String(e)) }
  }

  return (
    <Shell loading={loading} error={error}>
      <a className="back-link" href={`#/${company}/works-orders`}>← Works Orders</a>
      {w && (
        <div className="grn-shell">
          <div className="detail-grid">
            <div className="detail-card">
              <h3>{w.wo_no}</h3>
              <dl>
                <dt>Parent batch</dt><dd><a href={`#/${company}/batches/${w.parent_batch_no}`}>{w.parent_batch_no}</a></dd>
                <dt>Grade / heat</dt><dd>{w.grade || "—"} / {w.heat_no || "—"}</dd>
                <dt>Bar length</dt><dd>{w.parent_length_mm ? `${w.parent_length_mm} mm` : "—"}</dd>
                <dt>Available bars</dt><dd>{w.parent_qty_available}</dd>
                <dt>Operation</dt><dd>{w.operation_type || "—"}</dd>
                <dt>Status</dt><dd><Badge value={done ? "complete" : w.status} /></dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Yield</h3>
              <dl>
                <dt>Theoretical</dt><dd>{w.theoretical_yield_pct ?? "—"}%</dd>
                <dt>Actual</dt><dd>{w.actual_yield_pct ?? "—"}%</dd>
                <dt>Kerf / min offcut</dt><dd>{w.kerf_mm} / {w.min_offcut_mm} mm</dd>
              </dl>
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                {done || w.status === "complete"
                  ? <span className="badge badge--pass">complete</span>
                  : <>
                    {w.status === "queued" && <button onClick={() => setStatus("in_progress")}>▶ Start</button>}
                    {w.status === "in_progress" && <button className="action-btn" onClick={complete}>Complete &amp; cut</button>}
                    {w.status !== "cancelled" && <button onClick={() => setStatus("cancelled")}>Cancel WO</button>}
                  </>}
                {msg && <span className="badge" style={{ marginLeft: "0.5rem" }}>{msg}</span>}
              </div>
            </div>
          </div>

          {w.plan && !w.plan.error && (
            <div className="grn-section" style={{ marginBottom: "1rem" }}>
              <h3>Optimised cut plan — {w.plan.bars_used} bar(s), yield {w.plan.yield_pct}%</h3>
              <table className="conform-table">
                <thead><tr><th>Bar</th><th>Cuts (mm)</th><th>Offcut (mm)</th></tr></thead>
                <tbody>
                  {w.plan.bars.map((b, i) => (
                    <tr key={i}><td>{i + 1}</td><td>{b.join(" + ")}</td><td>{w.plan!.offcuts_mm[i]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {w.plan?.error && <p className="state-err">{w.plan.error}</p>}

          {w.outputs.length > 0 && (
            <div className="grn-section">
              <h3>Outputs</h3>
              <table>
                <thead><tr><th>Type</th><th>Batch</th><th className="r">Qty</th><th className="r">Length (mm)</th><th className="r">Weight (kg)</th></tr></thead>
                <tbody>
                  {w.outputs.map((o, i) => (
                    <tr key={i}>
                      <td><Badge value={o.output_type} /></td>
                      <td>{o.batch_no ? <a href={`#/${company}/batches/${o.batch_no}`}>{o.batch_no}</a> : "—"}</td>
                      <td className="r">{o.qty ?? "—"}</td>
                      <td className="r">{o.length_mm ?? "—"}</td>
                      <td className="r">{o.weight_kg ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grn-section">
            <h3>2D Plate Nesting</h3>
            {w.nesting_result_data ? (
              <div>
                <p>Utilisation: <strong>{w.nesting_result_data.utilisation_pct}%</strong></p>
                <p>Sheets used: {w.nesting_result_data.sheets_used}</p>
                {(w.nesting_result_data.remnants?.length ?? 0) > 0 && (
                  <p>Remnants: {w.nesting_result_data.remnants!.length} piece(s)</p>
                )}
                {w.nesting_result_data.notes && <p>Notes: {w.nesting_result_data.notes}</p>}
                <p className="muted">Imported: {w.nesting_imported_at}</p>
              </div>
            ) : w.nesting_export_data ? (
              <div>
                <p className="muted">Exported {w.nesting_exported_at}. Upload nesting results:</p>
                <NestingImportForm company={company} woNo={w.wo_no} onDone={() => setRev(r => r + 1)} />
              </div>
            ) : (
              <div>
                <a
                  href={`${import.meta.env.VITE_API_URL ?? ""}/api/v1/${company}/works-orders/${encodeURIComponent(w.wo_no)}/nesting-export`}
                  download={`nesting-${w.wo_no}.json`}
                  className="action-btn"
                  onClick={() => setTimeout(() => setRev(r => r + 1), 1500)}
                >
                  Export for Nesting
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  )
}

// ── Despatch (from allocations) + delivery notes ──────────────────────────────

function DespatchSection({ company, order }: { company: string; order: SalesOrderDetail }) {
  const [gross, setGross] = useState("")
  const [tare, setTare] = useState("")
  const [slip, setSlip] = useState("")
  const [override, setOverride] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [doc, setDoc] = useState<string | null>(null)

  async function despatch() {
    setMsg("Despatching…")
    try {
      const r = await api.dispatch.despatchOrder(company, order.order_no, {
        weighbridge_gross_kg: gross ? parseFloat(gross) : undefined,
        weighbridge_tare_kg: tare ? parseFloat(tare) : undefined,
        weighbridge_slip_ref: slip || undefined,
        override,
      })
      setDoc(r.doc_no)
      setMsg(`Despatched ${r.line_count} line(s) — net ${r.weighbridge_net_kg ?? "?"} kg`)
    } catch (e) { setMsg(String(e)) }
  }

  return (
    <div className="detail-lines">
      <h3>Despatch allocated stock</h3>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <label>Gross kg <input style={{ width: "6em" }} value={gross} onChange={e => setGross(e.target.value)} /></label>
        <label>Tare kg <input style={{ width: "6em" }} value={tare} onChange={e => setTare(e.target.value)} /></label>
        <label>WB slip <input style={{ width: "7em" }} value={slip} onChange={e => setSlip(e.target.value)} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} /> Override holds
        </label>
        <button className="action-btn" onClick={despatch}>Despatch</button>
        {doc && <a href={`#/${company}/delivery-notes/${doc}`}>→ {doc}</a>}
        {msg && <span className="badge">{msg}</span>}
      </div>
    </div>
  )
}

export function DeliveryNoteList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [hideVoided, setHideVoided] = useState(true)
  const q = useDebounce(search, 300)
  const { data, loading, error } = useData<DeliveryNote[]>(
    () => api.dispatch.list(company, q, hideVoided), [company, q, hideVoided]
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Delivery Notes">
        <SearchBar value={search} onChange={setSearch} />
        <label style={{ fontSize: "0.85em", display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <input type="checkbox" checked={hideVoided} onChange={e => setHideVoided(e.target.checked)} />
          Hide voided
        </label>
      </Toolbar>
      <table>
        <thead><tr><th>Doc No</th><th>Customer</th><th>Order</th><th>Ref</th><th>Date</th><th>Status</th><th>Printed</th><th>Invoiced</th></tr></thead>
        <tbody>
          {data?.map(r => (
            <tr key={r.doc_no} className="row-link" onClick={() => location.hash = `#/${company}/delivery-notes/${encodeURIComponent(r.doc_no)}`}>
              <td><strong className="row-link-id">{r.doc_no}</strong></td>
              <td>{r.customer_name || r.customer_account || "—"}</td>
              <td>{r.sales_order_no}</td>
              <td>{r.customer_ref || "—"}</td>
              <td>{fmtDate(r.date)}</td>
              <td>{r.status ? <Badge value={r.status} /> : "—"}</td>
              <td>{r.printed ? "✓" : "—"}</td>
              <td>{r.invoiced ? "✓" : "—"}</td>
            </tr>
          ))}
          {(!data || data.length === 0) && <tr><td colSpan={7} className="state-msg">No delivery notes.</td></tr>}
        </tbody>
      </table>
    </Shell>
  )
}

export function DeliveryNoteDetail({ company, id }: { company: string; id: string }) {
  const [rev, setRev] = useState(0)
  const { data: d, loading, error } = useData(() => api.dispatch.getNote(company, id), [company, id, rev])
  const [recv, setRecv] = useState("")
  const [notes, setNotes] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [podDone, setPodDone] = useState(false)
  const [autoInvNo, setAutoInvNo] = useState<string | null>(null)
  const [basis, setBasis] = useState<"theoretical" | "actual">("theoretical")
  const [invDoc, setInvDoc] = useState<string | null>(null)
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null)
  // Exception recording form
  const [excType, setExcType] = useState("short_delivery")
  const [excLine, setExcLine] = useState("")
  const [excQty, setExcQty] = useState("")
  const [excNotes, setExcNotes] = useState("")
  const [excBy, setExcBy] = useState("")
  const [excMsg, setExcMsg] = useState<string | null>(null)
  // Weighbridge entry
  const [wbGross, setWbGross] = useState("")
  const [wbTare, setWbTare] = useState("")
  const [wbSlip, setWbSlip] = useState("")
  const [wbMsg, setWbMsg] = useState<string | null>(null)

  async function recordWeighbridge() {
    const gross = parseFloat(wbGross), tare = parseFloat(wbTare)
    if (!gross || !tare) { setWbMsg("Enter gross and tare"); return }
    try {
      const r = await api.loads.weighbridge(company, id, { gross_kg: gross, tare_kg: tare, slip_ref: wbSlip || undefined })
      setWbMsg(`Net ${r.net_kg} kg — variance ${r.variance_pct ?? "n/a"}% (${r.band})`)
      setRev(rv => rv + 1)
    } catch (e) { setWbMsg(String(e)) }
  }

  // Cert check / override
  const [certResult, setCertResult] = useState<{ pass: boolean; lines: CertCheckLine[] } | null>(null)
  const [overrideReason, setOverrideReason] = useState("")
  const [certMsg, setCertMsg] = useState<string | null>(null)

  async function runCertCheck() {
    setCertMsg(null)
    try {
      const r = await api.despatchChecks.certValidation(company, id)
      setCertResult(r)
      if (r.pass) setRev(rv => rv + 1)
    } catch (e) { setCertMsg(String(e)) }
  }

  async function overrideCert() {
    if (!overrideReason.trim()) { setCertMsg("Enter override reason"); return }
    try {
      await api.despatchChecks.certOverride(company, id, overrideReason)
      setCertResult(null); setOverrideReason(""); setRev(rv => rv + 1)
      setCertMsg("Overridden — cert check bypassed")
    } catch (e) { setCertMsg(String(e)) }
  }

  async function confirmDespatch() {
    setConfirmMsg("Confirming…")
    try {
      const r = await api.dispatch.confirm(company, id)
      const recipients = r.email_prepared_to.length > 0 ? ` — cert pack prepared for: ${r.email_prepared_to.join(", ")}` : ""
      setConfirmMsg(`${r.status}${recipients}`)
    } catch (e) { setConfirmMsg(String(e)) }
  }

  async function openCertPack() {
    try {
      const r = await api.dispatch.certPackUrl(company, id)
      window.open(r.url, "_blank")
    } catch (e) { setConfirmMsg(String(e)) }
  }

  async function generateInvoice() {
    setMsg("Invoicing…")
    try {
      const r = await api.sales.generateInvoice(company, id, basis)
      setInvDoc(r.invoice_no)
      setMsg(`Invoice ${r.invoice_no} — £${r.total_gbp}${r.variance_flag ? " (weight variance!)" : ""}`)
    } catch (e) { setMsg(String(e)) }
  }

  async function pod() {
    if (!recv.trim()) { setMsg("Enter who received the delivery"); return }
    try {
      const r = await api.dispatch.recordPod(company, id, { received_by_name: recv.trim(), pod_notes: notes || undefined })
      setPodDone(true)
      if (r.auto_invoice_no) { setAutoInvNo(r.auto_invoice_no); setMsg(`POD recorded — invoice ${r.auto_invoice_no} auto-generated`) }
      else setMsg("POD recorded")
    } catch (e) { setMsg(String(e)) }
  }

  async function recordException() {
    if (!excType) return
    try {
      await api.dispatch.recordPodException(company, id, {
        exception_type: excType,
        dl_line_no: excLine ? Number(excLine) : undefined,
        qty_short: excQty ? Number(excQty) : undefined,
        notes: excNotes || undefined,
        raised_by: excBy || undefined,
      })
      setExcMsg("Exception recorded"); setExcNotes(""); setExcQty(""); setExcLine(""); setExcBy("")
      setRev(r => r + 1)
    } catch (e) { setExcMsg(String(e)) }
  }

  const hasPod = podDone || (d?.pod?.length ?? 0) > 0

  return (
    <Shell loading={loading} error={error}>
      <a className="back-link" href={`#/${company}/delivery-notes`}>← Delivery Notes</a>
      {d && (
        <div className="grn-shell">
          <Toolbar title={`Delivery Note ${d.doc_no}`}>
            {invDoc
              ? <a href={`#/${company}/invoices/${invDoc}`}>→ {invDoc}</a>
              : <>
                <select value={basis} onChange={e => setBasis(e.target.value as "theoretical" | "actual")}>
                  <option value="theoretical">bill theoretical</option>
                  <option value="actual">bill actual</option>
                </select>
                <button className="action-btn" onClick={generateInvoice}>Generate invoice</button>
              </>}
            <button className="action-btn" onClick={async () => { try { window.open(await api.dispatch.notePdf(company, d.doc_no), "_blank") } catch (e) { setMsg(String(e)) } }}>PDF</button>
            <button className="action-btn" onClick={() => window.print()}>Print</button>
            <button className="action-btn" onClick={confirmDespatch}>Confirm despatch</button>
            <button className="action-btn" onClick={openCertPack}>Cert pack PDF</button>
            {!hasPod && d.despatch_status !== "voided" && (
              <button className="action-btn action-btn--danger" onClick={async () => {
                const reason = window.prompt("Void reason:")
                if (!reason?.trim()) return
                try { await api.despatchChecks.voidDn(company, d.doc_no, reason.trim()); setRev(rv => rv + 1) }
                catch (e) { setConfirmMsg(String(e)) }
              }}>Void</button>
            )}
            {confirmMsg && <span className="badge">{confirmMsg}</span>}
          </Toolbar>
          <div className="detail-grid">
            <div className="detail-card">
              <h3>Despatch</h3>
              <dl>
                <dt>Customer</dt><dd>{d.customer_account
                  ? <a href={`#/${company}/customers/${encodeURIComponent(d.customer_account)}`}>{d.customer_name || d.customer_account}</a>
                  : "—"}</dd>
                <dt>Sales order</dt><dd>{d.sales_order_no
                  ? <a href={`#/${company}/sales-orders/${encodeURIComponent(d.sales_order_no)}`}><code>{d.sales_order_no}</code></a>
                  : "—"}</dd>
                <dt>Customer ref</dt><dd>{d.customer_ref || "—"}</dd>
                <dt>Status</dt><dd><Badge value={hasPod ? "pod_received" : d.despatch_status} /></dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Weighbridge</h3>
              <dl>
                <dt>Gross</dt><dd>{d.weighbridge_gross_kg ? `${d.weighbridge_gross_kg} kg` : "—"}</dd>
                <dt>Tare</dt><dd>{d.weighbridge_tare_kg ? `${d.weighbridge_tare_kg} kg` : "—"}</dd>
                <dt>Net</dt><dd>{d.weighbridge_net_kg ? `${d.weighbridge_net_kg} kg` : "—"}</dd>
                <dt>Theoretical</dt><dd>{d.weight_theoretical_kg ? `${d.weight_theoretical_kg} kg` : "—"}</dd>
                <dt>Slip</dt><dd>{d.weighbridge_slip_ref || "—"}</dd>
              </dl>
              {!hasPod && (
                <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  <input type="number" placeholder="Gross kg" step="any" value={wbGross} onChange={e => setWbGross(e.target.value)} style={{ width: "6rem" }} />
                  <input type="number" placeholder="Tare kg" step="any" value={wbTare} onChange={e => setWbTare(e.target.value)} style={{ width: "6rem" }} />
                  <input placeholder="Slip ref" value={wbSlip} onChange={e => setWbSlip(e.target.value)} style={{ width: "7rem" }} />
                  <button className="action-btn" onClick={recordWeighbridge}>Record</button>
                  {wbMsg && <span className="badge">{wbMsg}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="detail-lines">
            <h3>Lines</h3>
            <table>
              <thead><tr><th>#</th><th>Stock code</th><th>Heat</th><th>Cert</th><th>Description</th><th className="r">Qty</th><th className="r">Theo kg</th></tr></thead>
              <tbody>
                {d.lines.map(l => (
                  <tr key={l.line_no}>
                    <td>{l.line_no}</td>
                    <td>{l.stock_account_code
                      ? <a href={`#/${company}/stock/${encodeURIComponent(l.stock_account_code)}`}>{l.stock_account_code}</a>
                      : "—"}</td>
                    <td>{l.heat_no || "—"}</td>
                    <td>{l.cert_ref || "—"}</td>
                    <td>{l.short_description || "—"}</td>
                    <td className="r">{l.stk_qty_out ?? "—"}</td>
                    <td className="r">{l.weight_theoretical_kg ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="detail-lines">
            <h3>Certificate check</h3>
            {d.cert_validated_at
              ? <p style={{ color: "var(--pass, #27ae60)", margin: 0 }}>✓ Validated{d.cert_override_reason ? ` (override: ${d.cert_override_reason})` : ""}</p>
              : !certResult
                ? <button className="action-btn" onClick={runCertCheck}>Run cert check</button>
                : certResult.pass
                  ? <span className="badge badge--pass">All certs OK</span>
                  : <div>
                      {certResult.lines.filter(l => l.findings.some(f => f.level === "block")).map(l => (
                        <div key={l.line_no} style={{ marginBottom: "0.25rem" }}>
                          <strong>Line {l.line_no}:</strong>
                          {l.findings.filter(f => f.level === "block").map((f, i) => (
                            <span key={i} style={{ marginLeft: "0.5rem", color: "var(--fail, #c0392b)" }}>{f.message}</span>
                          ))}
                        </div>
                      ))}
                      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <input placeholder="Override reason (mandatory)" value={overrideReason}
                          onChange={e => setOverrideReason(e.target.value)} style={{ minWidth: "18rem" }} />
                        <button className="action-btn" onClick={overrideCert}>Override cert check</button>
                        <button onClick={runCertCheck}>Re-run</button>
                      </div>
                    </div>}
            {certMsg && <span className="badge" style={{ marginLeft: "0.5rem" }}>{certMsg}</span>}
          </div>
          <div className="detail-lines">
            <h3>Proof of delivery</h3>
            {hasPod ? (
              d.pod.length > 0
                ? <p>Received by <strong>{d.pod[0].received_by_name}</strong> at {d.pod[0].delivered_at?.slice(0, 16).replace("T", " ")}{d.pod[0].pod_notes ? ` — ${d.pod[0].pod_notes}` : ""}</p>
                : <p>Received by <strong>{recv}</strong></p>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <input placeholder="Received by" value={recv} onChange={e => setRecv(e.target.value)} />
                <input placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
                <button className="action-btn" onClick={pod}>Record POD</button>
              </div>
            )}
            {msg && <span className="badge" style={{ marginLeft: "0.5rem" }}>{msg}</span>}
            {autoInvNo && <span style={{ marginLeft: "0.5rem" }}>→ <a href={`#/${company}/invoices/${autoInvNo}`}>{autoInvNo}</a></span>}
          </div>

          {hasPod && (
            <div className="detail-lines">
              <h3>Delivery exceptions</h3>
              {(d?.pod_exceptions?.length ?? 0) > 0 && (
                <table style={{ marginBottom: "0.75rem" }}>
                  <thead><tr><th>Line</th><th>Type</th><th>Qty short</th><th>Notes</th><th>Raised by</th></tr></thead>
                  <tbody>
                    {d!.pod_exceptions.map((ex: { id: number; dl_line_no: number | null; exception_type: string; qty_short: string | null; notes: string | null; raised_by: string | null }) => (
                      <tr key={ex.id}>
                        <td>{ex.dl_line_no ?? "—"}</td>
                        <td><Badge value={ex.exception_type} /></td>
                        <td>{ex.qty_short ?? "—"}</td>
                        <td>{ex.notes || "—"}</td>
                        <td>{ex.raised_by || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <select value={excType} onChange={e => setExcType(e.target.value)}>
                  <option value="short_delivery">Short delivery</option>
                  <option value="damaged">Damaged</option>
                  <option value="wrong_material">Wrong material</option>
                </select>
                <input style={{ width: "4em" }} placeholder="Line #" value={excLine} onChange={e => setExcLine(e.target.value)} />
                <input style={{ width: "5em" }} placeholder="Qty short" value={excQty} onChange={e => setExcQty(e.target.value)} />
                <input placeholder="Notes" value={excNotes} onChange={e => setExcNotes(e.target.value)} />
                <input placeholder="Raised by" value={excBy} onChange={e => setExcBy(e.target.value)} />
                <button className="action-btn" onClick={recordException}>Record exception</button>
                {excMsg && <span className="badge">{excMsg}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Panel({ label, value, href, alert }: { label: string; value: React.ReactNode; href?: string; alert?: boolean }) {
  const card = (
    <div className="detail-card" style={{ borderLeft: alert ? "3px solid var(--fail, #c0392b)" : undefined }}>
      <div style={{ fontSize: "1.8rem", fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: "0.85rem", color: "var(--muted, #888)" }}>{label}</div>
    </div>
  )
  return href ? <a href={href} style={{ textDecoration: "none", color: "inherit" }}>{card}</a> : card
}

export function Dashboard({ company }: { company: string }) {
  const { data: d, loading, error } = useData<DashboardSummary>(() => api.dashboard.get(company), [company])
  const [wo, setWo] = useState<WOReportRow[]>([])
  const [holds, setHolds] = useState<CreditHoldRow[]>([])
  const [aged, setAged] = useState<AgedDebtorRow[]>([])
  useEffect(() => {
    api.dashboard.woReport(company).then(setWo).catch(console.error)
    api.dashboard.creditHolds(company).then(setHolds).catch(console.error)
    api.dashboard.agedDebtors(company).then(setAged).catch(console.error)
  }, [company])

  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Dashboard" />
      {d && (
        <>
          <div className="dash-panels">
            <Panel label="Open orders" value={d.open_orders} href={`#/${company}/sales-orders`} />
            <Panel label="Open quotes" value={d.open_quotes} href={`#/${company}/quotes`} />
            <Panel label="Despatches today" value={d.despatches_today} href={`#/${company}/delivery-notes`} />
            <Panel label="WO queued" value={d.wo_queued} href={`#/${company}/works-orders`} />
            <Panel label="WO in progress" value={d.wo_in_progress} href={`#/${company}/works-orders`} />
            <Panel label="Credit holds" value={d.credit_holds} alert={d.credit_holds > 0} />
            <Panel label="Uncerted batches" value={d.uncerted_batches} href={`#/${company}/batches`} alert={d.uncerted_batches > 0} />
            <Panel label="Overdue invoices" value={d.overdue_invoices} href={`#/${company}/invoices`} alert={d.overdue_invoices > 0} />
            <Panel label="Confirmed orders" value={d.confirmed_orders} href={`#/${company}/sales-orders`} alert={d.confirmed_orders > 0} />
            <Panel label="Low stock alerts" value={d.low_stock_count} href={`#/${company}/low-stock`} alert={d.low_stock_count > 0} />
            <Panel label="Available batches" value={d.available_batches} href={`#/${company}/batches`} />
            <Panel label="Stock weight (kg)" value={Math.round(d.stock_weight_kg)} />
            <Panel label="Open POs" value={d.open_purchase_orders} href={`#/${company}/purchase-orders`} />
            <Panel label="Overdue POs" value={d.overdue_pos} href={`#/${company}/purchase-orders`} alert={d.overdue_pos > 0} />
            <Panel label="AP awaiting payment" value={d.ap_awaiting_payment} href={`#/${company}/ap-register`} alert={d.ap_awaiting_payment > 0} />
            <Panel label="Revenue MTD" value={fmtGbp(d.revenue_mtd)} href={`#/${company}/invoices`} />
            <Panel label="Revenue YTD" value={fmtGbp(d.revenue_ytd)} href={`#/${company}/sales-perf`} />
          </div>

          {wo.length > 0 && (
            <details className="dash-section">
              <summary>Works orders</summary>
              <table className="conform-table">
                <thead><tr><th>Status</th><th>Count</th><th>Avg yield %</th><th>Remnant kg</th><th>Scrap kg</th></tr></thead>
                <tbody>
                  {wo.map(r => (
                    <tr key={r.status}><td>{r.status}</td><td>{r.count}</td><td>{r.avg_yield_pct ?? "—"}</td><td>{r.remnant_kg}</td><td>{r.scrap_kg}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {aged.length > 0 && (
            <details className="dash-section">
              <summary>Aged debtors (issued invoices)</summary>
              <table className="conform-table">
                <thead><tr><th>Customer</th><th className="r">Total</th><th className="r">0–30</th><th className="r">31–60</th><th className="r">61–90</th><th className="r">90+</th></tr></thead>
                <tbody>
                  {aged.slice(0, 25).map(r => (
                    <tr key={r.customer_account}>
                      <td><a href={`#/${company}/customers/${encodeURIComponent(r.customer_account)}`}>{r.name || r.customer_account}</a></td>
                      <td className="r">{fmtGbp(r.total_gbp)}</td>
                      <td className="r">{fmtGbp(r.d0_30)}</td><td className="r">{fmtGbp(r.d31_60)}</td>
                      <td className="r">{fmtGbp(r.d61_90)}</td>
                      <td className="r">{r.d90_plus > 0 ? <span className="badge badge--fail">{fmtGbp(r.d90_plus)}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          {holds.length > 0 && (
            <details className="dash-section">
              <summary>Customers on credit hold ({holds.length})</summary>
              <table>
                <thead><tr><th>Account</th><th>Name</th><th>Hold</th><th className="r">Balance</th><th className="r">Limit</th><th>Reason</th></tr></thead>
                <tbody>
                  {holds.slice(0, 25).map(h => (
                    <tr key={h.account_code}>
                      <td><a href={`#/${company}/customers/${encodeURIComponent(h.account_code)}`}><code>{h.account_code}</code></a></td>
                      <td>{h.name}</td>
                      <td><span className="badge badge--fail">{h.on_super_hold ? "super" : "hold"}</span></td>
                      <td className="r">{fmtGbp(h.balance_gbp)}</td>
                      <td className="r">{fmtGbp(h.credit_limit_gbp)}</td>
                      <td>{h.hold_reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </Shell>
  )
}

// ── Aged debtors standalone ───────────────────────────────────────────────────

export function AgedDebtors({ company }: { company: string }) {
  const { data: rows, loading, error } = useData<AgedDebtorRow[]>(
    () => api.dashboard.agedDebtors(company), [company]
  )
  const totals = rows ? {
    total: rows.reduce((s, r) => s + r.total_gbp, 0),
    d0_30: rows.reduce((s, r) => s + r.d0_30, 0),
    d31_60: rows.reduce((s, r) => s + r.d31_60, 0),
    d61_90: rows.reduce((s, r) => s + r.d61_90, 0),
    d90_plus: rows.reduce((s, r) => s + r.d90_plus, 0),
  } : null

  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Aged Debtors">
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("aged-debtors.csv",
            ["Account","Customer","Total £","0-30 £","31-60 £","61-90 £","90+ £"],
            rows.map(r => [r.customer_account, r.name, r.total_gbp.toFixed(2),
              r.d0_30.toFixed(2), r.d31_60.toFixed(2), r.d61_90.toFixed(2), r.d90_plus.toFixed(2)])
          )}>Export CSV</button>
        )}
      </Toolbar>
      {rows && rows.length === 0 && <p className="state-msg">No outstanding invoices.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Customer</th><th>Account</th>
                <th className="r">Total</th>
                <th className="r">0–30 days</th>
                <th className="r">31–60 days</th>
                <th className="r">61–90 days</th>
                <th className="r">90+ days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.customer_account}>
                  <td><a href={`#/${company}/customers/${encodeURIComponent(r.customer_account)}`}>{r.name || r.customer_account}</a></td>
                  <td><code>{r.customer_account}</code></td>
                  <td className="r"><strong>{fmtGbp(r.total_gbp)}</strong></td>
                  <td className="r">{r.d0_30 > 0 ? fmtGbp(r.d0_30) : "—"}</td>
                  <td className="r">{r.d31_60 > 0 ? fmtGbp(r.d31_60) : "—"}</td>
                  <td className="r">{r.d61_90 > 0 ? fmtGbp(r.d61_90) : "—"}</td>
                  <td className="r">{r.d90_plus > 0 ? <span className="badge badge--fail">{fmtGbp(r.d90_plus)}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr style={{ fontWeight: 600 }}>
                  <td colSpan={2}>Total ({rows.length} customers)</td>
                  <td className="r">{fmtGbp(totals.total)}</td>
                  <td className="r">{fmtGbp(totals.d0_30)}</td>
                  <td className="r">{fmtGbp(totals.d31_60)}</td>
                  <td className="r">{fmtGbp(totals.d61_90)}</td>
                  <td className="r">{totals.d90_plus > 0 ? <span className="badge badge--fail">{fmtGbp(totals.d90_plus)}</span> : "—"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Shell>
  )
}

// ── OTIF report ───────────────────────────────────────────────────────────────

export function OTIFReport({ company }: { company: string }) {
  const [months, setMonths] = useState(6)
  const { data, loading, error } = useData<{ by_customer: OTIFCustomerRow[]; by_month: OTIFMonthRow[]; months: number }>(
    () => api.reports.otif(company, months), [company, months]
  )
  const overall = data?.by_customer.reduce(
    (acc, r) => ({ total: acc.total + r.total, on_time: acc.on_time + r.on_time }),
    { total: 0, on_time: 0 }
  )
  const pct = overall && overall.total > 0 ? (overall.on_time / overall.total * 100).toFixed(1) : null

  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="OTIF Report">
        <select value={months} onChange={e => setMonths(Number(e.target.value))}>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </Toolbar>

      {pct !== null && (
        <div style={{ marginBottom: "1.5rem", display: "flex", gap: "2rem" }}>
          <div className="detail-card" style={{ minWidth: "160px" }}>
            <h3>Overall OTIF</h3>
            <p style={{ fontSize: "2rem", margin: 0, color: Number(pct) >= 95 ? "var(--color-ok,#090)" : Number(pct) >= 80 ? "var(--color-warn,#a06000)" : "var(--color-danger,#c00)" }}>
              {pct}%
            </p>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted,#888)" }}>
              {overall!.on_time} of {overall!.total} deliveries on time
            </p>
          </div>
          {data!.by_month.length > 0 && (
            <div className="detail-card" style={{ flex: 1 }}>
              <h3>Monthly trend</h3>
              <table>
                <thead><tr><th>Month</th><th className="r">Deliveries</th><th className="r">On time</th><th className="r">OTIF %</th></tr></thead>
                <tbody>
                  {data!.by_month.map(r => (
                    <tr key={r.month}>
                      <td>{r.month}</td>
                      <td className="r">{r.total}</td>
                      <td className="r">{r.on_time}</td>
                      <td className="r">{r.on_time_pct ?? "—"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {data && data.by_customer.length > 0 && (
        <div className="detail-lines">
          <h3>By customer</h3>
          <table>
            <thead>
              <tr><th>Customer</th><th>Account</th><th className="r">Deliveries</th><th className="r">On time</th><th className="r">OTIF %</th></tr>
            </thead>
            <tbody>
              {data.by_customer.map(r => (
                <tr key={r.customer_account}>
                  <td><a href={`#/${company}/customers/${encodeURIComponent(r.customer_account)}`}>{r.name || r.customer_account}</a></td>
                  <td><code>{r.customer_account}</code></td>
                  <td className="r">{r.total}</td>
                  <td className="r">{r.on_time}</td>
                  <td className="r">{r.on_time_pct !== null
                    ? <span style={{ color: (r.on_time_pct ?? 0) >= 95 ? "var(--color-ok,#090)" : (r.on_time_pct ?? 0) >= 80 ? "var(--color-warn,#a06000)" : "var(--color-danger,#c00)" }}>{r.on_time_pct}%</span>
                    : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.by_customer.length === 0 && <p className="state-msg">No despatch data for this period.</p>}
    </Shell>
  )
}

// ── Stock turn report ─────────────────────────────────────────────────────────

export function StockTurnReport({ company }: { company: string }) {
  const [months, setMonths] = useState(12)
  const { data: rows, loading, error } = useData<StockTurnRow[]>(
    () => api.reports.stockTurn(company, months), [company, months]
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Stock Turn">
        <select value={months} onChange={e => setMonths(Number(e.target.value))}>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv(`stock-turn-${months}m.csv`,
            ["Code","Description","Material","Section","Grade","In stock","Despatched","Ann. turn"],
            rows.map(r => [r.account_code, r.description_1, r.attribute_1, r.attribute_2, r.attribute_3,
              r.stock_qty, r.despatched, r.annualized_turn ?? ""])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Annualised turn = qty despatched in period ÷ current stock qty × (12 ÷ {months} months).
        Showing active codes with despatch activity, sorted by volume.
      </p>
      {rows && rows.length === 0 && <p className="state-msg">No despatch data for this period.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Description</th><th>Mat</th><th>Sect</th><th>Grade</th>
                <th className="r">In stock</th><th className="r">Despatched</th><th className="r">Ann. turn ×</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.account_code}>
                  <td><a href={`#/${company}/stock/${encodeURIComponent(r.account_code)}`}><code>{r.account_code}</code></a></td>
                  <td>{r.description_1 || "—"}</td>
                  <td>{r.attribute_1 || "—"}</td>
                  <td>{r.attribute_2 || "—"}</td>
                  <td>{r.attribute_3 || "—"}</td>
                  <td className="r">{r.stock_qty}</td>
                  <td className="r">{r.despatched}</td>
                  <td className="r" style={{ color: r.annualized_turn !== null && r.annualized_turn >= 4 ? "var(--color-ok,#090)" : r.annualized_turn !== null && r.annualized_turn < 1 ? "var(--color-warn,#a06000)" : undefined }}>
                    {r.annualized_turn !== null ? r.annualized_turn : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

// ── Margin analysis ───────────────────────────────────────────────────────────

export function MarginsReport({ company }: { company: string }) {
  const { data: rows, loading, error } = useData<MarginRow[]>(
    () => api.reports.margins(company), [company]
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Margin Analysis">
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("margins.csv",
            ["Code","Description","Material","Grade","Unit","Cost","Sell","Margin%"],
            rows.map(r => [r.account_code, r.description_1, r.attribute_1, r.attribute_3, r.stock_unit_1,
              r.cost_price?.toFixed(4) ?? "", r.sell_price?.toFixed(4) ?? "", r.margin_pct ?? ""])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Nominal margin using list sell price vs cost price. Active stock codes with both prices set.
      </p>
      {rows && rows.length === 0 && <p className="state-msg">No stock items with both cost and sell prices set.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Description</th><th>Mat</th><th>Grade</th><th>Unit</th>
                <th className="r">Cost</th><th className="r">Sell</th><th className="r">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.account_code}>
                  <td><a href={`#/${company}/stock/${encodeURIComponent(r.account_code)}`}><code>{r.account_code}</code></a></td>
                  <td>{r.description_1 || "—"}</td>
                  <td>{r.attribute_1 || "—"}</td>
                  <td>{r.attribute_3 || "—"}</td>
                  <td>{r.stock_unit_1 || "—"}</td>
                  <td className="r">{r.cost_price !== null ? `£${r.cost_price.toFixed(4)}` : "—"}</td>
                  <td className="r">{r.sell_price !== null ? `£${r.sell_price.toFixed(4)}` : "—"}</td>
                  <td className="r" style={{ color: r.margin_pct !== null && r.margin_pct >= 25 ? "var(--color-ok,#090)" : r.margin_pct !== null && r.margin_pct < 10 ? "var(--color-warn,#a06000)" : undefined }}>
                    {r.margin_pct !== null ? `${r.margin_pct}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function StockValuationReport({ company }: { company: string }) {
  const { data: rows, loading, error } = useData<StockValuationRow[]>(
    () => api.reports.stockValuation(company), [company]
  )
  const total = rows ? rows.reduce((s, r) => s + r.value_gbp, 0) : 0
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Stock Valuation">
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("stock-valuation.csv",
            ["Code","Description","Material","Grade","Unit","Qty","Cost/unit","Value £"],
            rows.map(r => [r.account_code, r.description_1, r.attribute_1, r.attribute_3, r.stock_unit_1,
              r.qty.toFixed(3), r.cost_price.toFixed(4), r.value_gbp.toFixed(2)])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Current stock value at cost (qty × cost price). Active items with positive stock only. Top 200 by value.
      </p>
      {rows && rows.length === 0 && <p className="state-msg">No stock in hand.</p>}
      {rows && rows.length > 0 && (
        <>
          <p style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
            Total: £{total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="detail-lines">
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Description</th><th>Mat</th><th>Grade</th><th>Unit</th>
                  <th className="r">Qty</th><th className="r">Cost/unit</th><th className="r">Value £</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.account_code}>
                    <td><a href={`#/${company}/stock/${encodeURIComponent(r.account_code)}`}><code>{r.account_code}</code></a></td>
                    <td>{r.description_1 || "—"}</td>
                    <td>{r.attribute_1 || "—"}</td>
                    <td>{r.attribute_3 || "—"}</td>
                    <td>{r.stock_unit_1 || "—"}</td>
                    <td className="r">{r.qty.toFixed(3)}</td>
                    <td className="r">£{r.cost_price.toFixed(4)}</td>
                    <td className="r">£{r.value_gbp.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  )
}

export function StockMixReport({ company }: { company: string }) {
  const [by, setBy] = useState<"attribute_1" | "attribute_2" | "attribute_3" | "attribute_4">("attribute_1")
  const { data: rows, loading, error } = useData<{ value: string; description: string | null; items: number; stock_qty: number }[]>(
    () => api.stock.attributeReport(company, by), [company, by]
  )
  const LABELS: Record<string, string> = { attribute_1: "Material", attribute_2: "Section", attribute_3: "Grade", attribute_4: "Finish" }
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Stock Mix">
        <select value={by} onChange={e => setBy(e.target.value as typeof by)} style={{ fontSize: "0.85rem" }}>
          {(Object.entries(LABELS)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Active stock codes grouped by {LABELS[by].toLowerCase()}.
      </p>
      {rows && rows.length === 0 && <p className="state-msg">No data.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>{LABELS[by]}</th><th className="r">Items</th><th className="r">Stock qty (×10000)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.value}>
                  <td><code>{r.value}</code></td>
                  <td>{r.description || "—"}</td>
                  <td className="r">{r.items}</td>
                  <td className="r">{stk(r.stock_qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function LowStockReport({ company }: { company: string }) {
  const { data: rows, loading, error } = useData<LowStockRow[]>(
    () => api.reports.lowStock(company), [company]
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Low Stock">
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("low-stock.csv",
            ["Code","Description","Material","Grade","Unit","On Hand","Reorder Level","Reorder Qty"],
            rows.map(r => [r.account_code, r.description_1, r.attribute_1, r.attribute_3, r.stock_unit_1,
              r.qty.toFixed(3), r.reorder_level.toFixed(3), r.reorder_qty.toFixed(3)])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Active stock codes at or below their reorder level.
      </p>
      {rows && rows.length === 0 && <p className="state-msg">All stock above reorder levels.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Description</th><th>Mat</th><th>Grade</th><th>Unit</th>
                <th className="r">On Hand</th><th className="r">Reorder Level</th><th className="r">Reorder Qty</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.account_code} style={{ background: r.qty <= 0 ? "var(--color-warn-bg,#fff8e0)" : undefined }}>
                  <td><a href={`#/${company}/stock/${encodeURIComponent(r.account_code)}`}><code>{r.account_code}</code></a></td>
                  <td>{r.description_1 || "—"}</td>
                  <td>{r.attribute_1 || "—"}</td>
                  <td>{r.attribute_3 || "—"}</td>
                  <td>{r.stock_unit_1 || "—"}</td>
                  <td className="r" style={{ color: r.qty <= 0 ? "var(--color-warn,#a06000)" : undefined }}>
                    {r.qty.toFixed(3)}
                  </td>
                  <td className="r">{r.reorder_level.toFixed(3)}</td>
                  <td className="r">{r.reorder_qty.toFixed(3)}</td>
                  <td>
                    <a href={`#/${company}/purchase-orders/new?stock=${encodeURIComponent(r.account_code)}&qty=${r.reorder_qty.toFixed(3)}`}
                       style={{ fontSize: "0.8rem" }}>Reorder</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function StockAgeReport({ company }: { company: string }) {
  const { data: rows, loading, error } = useData<StockAgeRow[]>(
    () => api.reports.stockAge(company), [company]
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Stock Age">
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("stock-age.csv",
            ["Code","Description","Material","Grade","Unit","Qty","Weight kg","Batches","Avg Age (days)","Oldest date","<30d","30-90d","90-180d","180+d"],
            rows.map(r => [r.account_code, r.description_1, r.attribute_1, r.attribute_3, r.stock_unit_1,
              r.qty_available.toFixed(3), r.weight_kg.toFixed(1), r.batch_count,
              r.avg_age_days, r.oldest_batch_date ?? "",
              r.lt30, r.d30_90, r.d90_180, r.gt180])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Available stock batches grouped by stock code, sorted by average age (oldest first). Helps identify slow-moving or aged stock.
      </p>
      {rows && rows.length === 0 && <p className="state-msg">No available stock batches.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Description</th><th>Mat</th><th>Grade</th><th>Unit</th>
                <th className="r">Qty</th><th className="r">Batches</th><th className="r">Avg age</th>
                <th className="r" title="Batches under 30 days old">&lt;30d</th>
                <th className="r" title="Batches 30–90 days old">30–90d</th>
                <th className="r" title="Batches 90–180 days old">90–180d</th>
                <th className="r" style={{ color: "var(--color-warn,#a06000)" }} title="Batches over 180 days old">180+d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.account_code} style={{ background: r.gt180 > 0 ? "var(--color-warn-bg,#fff8e0)" : undefined }}>
                  <td><a href={`#/${company}/stock/${encodeURIComponent(r.account_code)}`}><code>{r.account_code}</code></a></td>
                  <td>{r.description_1 || "—"}</td>
                  <td>{r.attribute_1 || "—"}</td>
                  <td>{r.attribute_3 || "—"}</td>
                  <td>{r.stock_unit_1 || "—"}</td>
                  <td className="r">{r.qty_available.toFixed(3)}</td>
                  <td className="r">{r.batch_count}</td>
                  <td className="r">{r.avg_age_days}d</td>
                  <td className="r">{r.lt30 || "—"}</td>
                  <td className="r">{r.d30_90 || "—"}</td>
                  <td className="r">{r.d90_180 || "—"}</td>
                  <td className="r" style={{ color: r.gt180 > 0 ? "var(--color-warn,#a06000)" : undefined, fontWeight: r.gt180 > 0 ? 600 : undefined }}>
                    {r.gt180 || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function CustomerStatement({ company, id }: { company: string; id: string }) {
  const [months, setMonths] = useState(12)
  const { data, loading, error } = useData<{ invoices: StatementInvoice[]; payments: StatementPayment[] }>(
    () => api.customers.statement(company, id, months), [company, id, months]
  )
  const invoices = data?.invoices ?? []
  const payments = data?.payments ?? []
  const totalOutstanding = invoices.reduce((s, i) => s + Math.max(0, i.outstanding_gbp), 0)
  const totalPaid = payments.reduce((s, p) => s + p.amount_gbp, 0)
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title={`Statement — ${id}`}>
        <a href={`#/${company}/customers/${encodeURIComponent(id)}`} className="action-btn" style={{ textDecoration: "none" }}>← Customer</a>
        <select value={months} onChange={e => setMonths(Number(e.target.value))} style={{ fontSize: "0.85rem" }}>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
        {data && <>
          <button className="action-btn" onClick={async () => { try { window.open(await api.customers.statementPdf(company, id, months), "_blank") } catch (e) { alert(String(e)) } }}>PDF</button>
          <button onClick={() => {
            const rows = [
              ...invoices.map(i => ["Invoice", i.doc_no, i.date_serial ?? "", i.total_gbp.toFixed(2), i.outstanding_gbp.toFixed(2), i.status ?? ""]),
              ...payments.map(p => ["Payment", p.payment_no, p.date_serial ?? "", "", p.amount_gbp.toFixed(2), p.reference ?? ""]),
            ]
            rows.sort((a, b) => (a[2] as string).localeCompare(b[2] as string))
            downloadCsv(`statement-${id}.csv`, ["Type","Reference","Date","Invoice Total £","Amount £","Status/Ref"], rows)
          }}>Export CSV</button>
        </>}
      </Toolbar>
      {data && (
        <div style={{ display: "flex", gap: "2rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          <span><strong>Outstanding:</strong> {fmtGbp(totalOutstanding)}</span>
          <span><strong>Paid (period):</strong> {fmtGbp(totalPaid)}</span>
        </div>
      )}
      {invoices.length > 0 && (
        <div className="detail-lines">
          <h3>Invoices</h3>
          <table>
            <thead>
              <tr><th>Invoice</th><th>Date</th><th>Status</th><th className="r">Total</th><th className="r">Outstanding</th></tr>
            </thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.doc_no} style={{ background: i.outstanding_gbp > 0 && i.status === "issued" ? "var(--color-warn-bg,#fff8e0)" : undefined }}>
                  <td><a href={`#/${company}/invoices/${encodeURIComponent(i.doc_no)}`}><code>{i.doc_no}</code></a></td>
                  <td>{i.date_serial || "—"}</td>
                  <td><Badge value={i.status ?? "—"} /></td>
                  <td className="r">{fmtGbp(i.total_gbp)}</td>
                  <td className="r">{i.outstanding_gbp > 0 ? <strong>{fmtGbp(i.outstanding_gbp)}</strong> : fmtGbp(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {payments.length > 0 && (
        <div className="detail-lines" style={{ marginTop: "1.5rem" }}>
          <h3>Payments received</h3>
          <table>
            <thead>
              <tr><th>Payment</th><th>Date</th><th>Method</th><th>Reference</th><th className="r">Amount</th></tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.payment_no}>
                  <td><code>{p.payment_no}</code></td>
                  <td>{p.date_serial || "—"}</td>
                  <td>{p.method || "—"}</td>
                  <td>{p.reference || "—"}</td>
                  <td className="r">{fmtGbp(p.amount_gbp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && invoices.length === 0 && payments.length === 0 && (
        <p className="state-msg">No transactions in this period.</p>
      )}
    </Shell>
  )
}

export function MonthlyRevenueReport({ company }: { company: string }) {
  const [months, setMonths] = useState(12)
  const { data: rows, loading, error } = useData<MonthlyRevenueRow[]>(
    () => api.reports.monthlyRevenue(company, months), [company, months]
  )
  const grand = rows ? rows.reduce((s, r) => s + r.total_gbp, 0) : 0
  const peak = rows ? Math.max(...rows.map(r => r.total_gbp), 1) : 1
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Monthly Revenue">
        <select value={months} onChange={e => setMonths(Number(e.target.value))} style={{ fontSize: "0.85rem" }}>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("monthly-revenue.csv",
            ["Month","Invoices","Net £","Total £"],
            rows.map(r => [r.month, r.invoice_count, r.net_gbp.toFixed(2), r.total_gbp.toFixed(2)])
          )}>Export CSV</button>
        )}
      </Toolbar>
      {rows && rows.length > 0 && (
        <p style={{ fontSize: "0.9rem", margin: "0 0 1rem" }}>
          <strong>{months}-month total:</strong> {fmtGbp(grand)} &nbsp; <strong>Average/month:</strong> {fmtGbp(grand / rows.length)}
        </p>
      )}
      {rows && rows.length === 0 && <p className="state-msg">No invoices in this period.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr><th>Month</th><th className="r">Invoices</th><th className="r">Net</th><th className="r">Total</th><th style={{ width: "200px" }}>Bar</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td className="r">{r.invoice_count}</td>
                  <td className="r">{fmtGbp(r.net_gbp)}</td>
                  <td className="r"><strong>{fmtGbp(r.total_gbp)}</strong></td>
                  <td>
                    <div style={{ background: "var(--color-accent,#2563eb)", height: "12px", borderRadius: "2px",
                      width: `${Math.round(r.total_gbp / peak * 180)}px`, maxWidth: "180px", minWidth: r.total_gbp > 0 ? "4px" : 0 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function SalespersonPerfReport({ company }: { company: string }) {
  const [months, setMonths] = useState(12)
  const { data: rows, loading, error } = useData<SalespersonPerfRow[]>(
    () => api.reports.salespersonPerf(company, months), [company, months]
  )
  const total = rows ? rows.reduce((s, r) => s + r.total_gbp, 0) : 0
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Salesperson Performance">
        <select value={months} onChange={e => setMonths(Number(e.target.value))} style={{ fontSize: "0.85rem" }}>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("salesperson-perf.csv",
            ["Salesperson","Customers","Invoices","Total £","% Revenue"],
            rows.map(r => [r.salesperson_name, r.customer_count, r.invoice_count, r.total_gbp.toFixed(2),
              total > 0 ? (r.total_gbp / total * 100).toFixed(1) : ""])
          )}>Export CSV</button>
        )}
      </Toolbar>
      {rows && rows.length > 0 && (
        <p style={{ fontSize: "0.9rem", margin: "0 0 1rem" }}>
          <strong>{rows.length} salespeople</strong> — total revenue: <strong>{fmtGbp(total)}</strong>
        </p>
      )}
      {rows && rows.length === 0 && <p className="state-msg">No data for this period.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Salesperson</th><th className="r">Customers</th><th className="r">Invoices</th>
                <th className="r">Total</th><th className="r">% Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.salesperson_id}>
                  <td>{r.salesperson_name}</td>
                  <td className="r">{r.customer_count}</td>
                  <td className="r">{r.invoice_count}</td>
                  <td className="r"><strong>{fmtGbp(r.total_gbp)}</strong></td>
                  <td className="r">{total > 0 ? `${(r.total_gbp / total * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function OutstandingLinesReport({ company }: { company: string }) {
  const { data: rows, loading, error } = useData<OutstandingLineRow[]>(
    () => api.reports.outstandingLines(company), [company]
  )
  const today = new Date().toISOString().slice(0, 10)
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Outstanding Order Lines">
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("outstanding-lines.csv",
            ["Order", "Customer", "Ref", "Line", "Stock Code", "Description", "Ordered", "Sent", "Outstanding", "Delivery date", "Status"],
            rows.map(r => [r.order_no, r.customer_name || r.customer_account, r.customer_ref ?? "",
              r.line_no, r.stock_account_code ?? "", r.short_description ?? "",
              r.qty_ordered, r.qty_sent, r.qty_outstanding, r.delivery_date ?? "", r.order_status ?? ""])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Open and confirmed SO lines where qty_sent &lt; qty_ordered, sorted by delivery date.
      </p>
      <table>
        <thead>
          <tr>
            <th>Order</th><th>Customer</th><th>Stock Code</th><th>Description</th>
            <th className="r">Ordered</th><th className="r">Sent</th><th className="r">Outstanding</th>
            <th>Due</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r, i) => {
            const overdue = r.delivery_date && r.delivery_date < today
            return (
              <tr key={`${r.order_no}-${r.line_no}-${i}`}>
                <td><a href={`#/${company}/sales-orders/${encodeURIComponent(r.order_no)}`}><code>{r.order_no}</code></a></td>
                <td><a href={`#/${company}/customers/${encodeURIComponent(r.customer_account)}`}>{r.customer_name || r.customer_account}</a></td>
                <td>{r.stock_account_code ? <a href={`#/${company}/stock/${encodeURIComponent(r.stock_account_code)}`}><code>{r.stock_account_code}</code></a> : "—"}</td>
                <td>{r.short_description || "—"}</td>
                <td className="r">{r.qty_ordered}</td>
                <td className="r">{r.qty_sent || "—"}</td>
                <td className="r" style={{ fontWeight: 600 }}>{r.qty_outstanding}</td>
                <td style={overdue ? { color: "var(--color-fail,#c00)", fontWeight: 600 } : undefined}>
                  {r.delivery_date || "—"}{overdue ? " !" : ""}
                </td>
                <td><Badge value={r.order_status ?? "—"} /></td>
              </tr>
            )
          })}
          {(!rows || rows.length === 0) && <tr><td colSpan={9} className="state-msg">No outstanding lines.</td></tr>}
        </tbody>
      </table>
    </Shell>
  )
}

export function SalesPerfReport({ company }: { company: string }) {
  const [months, setMonths] = useState(12)
  const { data: rows, loading, error } = useData<SalesPerfRow[]>(
    () => api.reports.salesPerf(company, months), [company, months]
  )
  const total = rows ? rows.reduce((s, r) => s + r.total_gbp, 0) : 0
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Sales Performance">
        <select value={months} onChange={e => setMonths(Number(e.target.value))} style={{ fontSize: "0.85rem" }}>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("sales-performance.csv",
            ["Account","Customer","Invoices","Net £","Total £"],
            rows.map(r => [r.customer_account, r.customer_name ?? "", r.invoice_count, r.net_gbp.toFixed(2), r.total_gbp.toFixed(2)])
          )}>Export CSV</button>
        )}
      </Toolbar>
      {rows && rows.length > 0 && (
        <p style={{ fontSize: "0.9rem", margin: "0 0 1rem" }}>
          <strong>{rows.length} customers</strong> — total revenue: <strong>{fmtGbp(total)}</strong>
        </p>
      )}
      {rows && rows.length === 0 && <p className="state-msg">No invoices in this period.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Account</th><th>Customer</th><th className="r">Invoices</th>
                <th className="r">Net</th><th className="r">Total</th><th className="r">% Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.customer_account}>
                  <td><a href={`#/${company}/customers/${encodeURIComponent(r.customer_account)}`}><code>{r.customer_account}</code></a></td>
                  <td>{r.customer_name || "—"}</td>
                  <td className="r">{r.invoice_count}</td>
                  <td className="r">{fmtGbp(r.net_gbp)}</td>
                  <td className="r"><strong>{fmtGbp(r.total_gbp)}</strong></td>
                  <td className="r">{total > 0 ? `${(r.total_gbp / total * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function OverdueInvoicesReport({ company }: { company: string }) {
  const [days, setDays] = useState(30)
  const { data: rows, loading, error } = useData<OverdueInvoiceRow[]>(
    () => api.reports.overdueInvoices(company, days), [company, days]
  )
  const total = rows ? rows.reduce((s, r) => s + r.outstanding_gbp, 0) : 0
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Overdue Invoices">
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ fontSize: "0.85rem" }}>
          <option value={30}>Over 30 days</option>
          <option value={60}>Over 60 days</option>
          <option value={90}>Over 90 days</option>
        </select>
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("overdue-invoices.csv",
            ["Invoice","Customer","Name","Phone","Email","Invoice Date","Due Date","Age (days)","Outstanding £"],
            rows.map(r => [r.invoice_no, r.customer_account, r.customer_name, r.telephone ?? "", r.email ?? "",
              r.invoice_date ?? "", r.due_date ?? "", r.age_days, r.outstanding_gbp.toFixed(2)])
          )}>Export CSV</button>
        )}
      </Toolbar>
      {rows && rows.length > 0 && (
        <p style={{ fontSize: "0.9rem", margin: "0 0 1rem" }}>
          <strong>{rows.length} overdue invoices</strong> — total outstanding: <strong>{fmtGbp(total)}</strong>
        </p>
      )}
      {rows && rows.length === 0 && <p className="state-msg">No overdue invoices. Well done!</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Invoice</th><th>Account</th><th>Customer</th><th>Phone</th><th>Email</th>
                <th className="r">Age</th><th className="r">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.invoice_no} style={{ background: r.age_days > 90 ? "var(--color-warn-bg,#fff8e0)" : undefined }}>
                  <td><a href={`#/${company}/invoices/${encodeURIComponent(r.invoice_no)}`}><code>{r.invoice_no}</code></a></td>
                  <td><a href={`#/${company}/customers/${encodeURIComponent(r.customer_account)}`}><code>{r.customer_account}</code></a></td>
                  <td>{r.customer_name || "—"}</td>
                  <td>{r.telephone || "—"}</td>
                  <td>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : "—"}</td>
                  <td className="r" style={{ color: r.age_days > 90 ? "var(--color-warn,#a06000)" : undefined, fontWeight: r.age_days > 90 ? 600 : undefined }}>
                    {r.age_days}d
                  </td>
                  <td className="r"><strong>{fmtGbp(r.outstanding_gbp)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function SupplierSpendReport({ company }: { company: string }) {
  const [months, setMonths] = useState(12)
  const { data: rows, loading, error } = useData<SupplierSpendRow[]>(
    () => api.reports.supplierSpend(company, months), [company, months]
  )
  const total = rows ? rows.reduce((s, r) => s + r.total_gbp, 0) : 0
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Supplier Spend">
        <select value={months} onChange={e => setMonths(Number(e.target.value))} style={{ fontSize: "0.85rem" }}>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("supplier-spend.csv",
            ["Account","Supplier","POs","Net £","Total £","% Spend"],
            rows.map(r => [r.supplier_account, r.supplier_name ?? "", r.po_count, r.net_gbp.toFixed(2), r.total_gbp.toFixed(2),
              total > 0 ? (r.total_gbp / total * 100).toFixed(1) : ""])
          )}>Export CSV</button>
        )}
      </Toolbar>
      {rows && rows.length > 0 && (
        <p style={{ fontSize: "0.9rem", margin: "0 0 1rem" }}>
          <strong>{rows.length} suppliers</strong> — total spend: <strong>{fmtGbp(total)}</strong>
        </p>
      )}
      {rows && rows.length === 0 && <p className="state-msg">No purchase orders in this period.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>Account</th><th>Supplier</th><th className="r">POs</th>
                <th className="r">Net</th><th className="r">Total</th><th className="r">% Spend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.supplier_account}>
                  <td><a href={`#/${company}/suppliers/${encodeURIComponent(r.supplier_account)}`}><code>{r.supplier_account}</code></a></td>
                  <td>{r.supplier_name || "—"}</td>
                  <td className="r">{r.po_count}</td>
                  <td className="r">{fmtGbp(r.net_gbp)}</td>
                  <td className="r"><strong>{fmtGbp(r.total_gbp)}</strong></td>
                  <td className="r">{total > 0 ? `${(r.total_gbp / total * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

export function OutstandingPOLinesReport({ company }: { company: string }) {
  const { data: rows, loading, error } = useData<OutstandingPOLineRow[]>(
    () => api.reports.outstandingPOLines(company), [company]
  )
  const today = new Date().toISOString().slice(0, 10)
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Outstanding PO Lines">
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("outstanding-po-lines.csv",
            ["PO", "Supplier", "Line", "Stock Code", "Description", "Ordered", "Received", "Outstanding", "Due date"],
            rows.map(r => [r.order_no, r.supplier_name || r.supplier_account, r.line_no,
              r.stock_account_code ?? "", r.description_1 ?? "",
              r.qty_ordered, r.qty_received, r.qty_outstanding, r.delivery_date ?? ""])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Open PO lines where qty_received &lt; qty_ordered, sorted by due date.
      </p>
      <table>
        <thead>
          <tr>
            <th>PO</th><th>Supplier</th><th>Stock Code</th><th>Description</th>
            <th className="r">Ordered</th><th className="r">Received</th><th className="r">Outstanding</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r, i) => {
            const overdue = r.delivery_date && r.delivery_date < today
            return (
              <tr key={`${r.order_no}-${r.line_no}-${i}`}>
                <td><a href={`#/${company}/purchase-orders/${encodeURIComponent(r.order_no)}`}><code>{r.order_no}</code></a></td>
                <td><a href={`#/${company}/suppliers/${encodeURIComponent(r.supplier_account)}`}>{r.supplier_name || r.supplier_account}</a></td>
                <td>{r.stock_account_code ? <a href={`#/${company}/stock/${encodeURIComponent(r.stock_account_code)}`}><code>{r.stock_account_code}</code></a> : "—"}</td>
                <td>{r.description_1 || "—"}</td>
                <td className="r">{r.qty_ordered}</td>
                <td className="r">{r.qty_received || "—"}</td>
                <td className="r" style={{ fontWeight: 600 }}>{r.qty_outstanding}</td>
                <td style={overdue ? { color: "var(--color-fail,#c00)", fontWeight: 600 } : undefined}>
                  {r.delivery_date || "—"}{overdue ? " !" : ""}
                </td>
              </tr>
            )
          })}
          {(!rows || rows.length === 0) && <tr><td colSpan={8} className="state-msg">No outstanding PO lines.</td></tr>}
        </tbody>
      </table>
    </Shell>
  )
}

export function APRegister({ company }: { company: string }) {
  const [status, setStatus] = useState("")
  const [rev, setRev] = useState(0)
  const { data: rows, loading, error } = useData<APRegisterRow[]>(
    () => api.reports.apRegister(company, status), [company, status, rev]
  )
  const STATUSES = [
    { value: "", label: "All" },
    { value: "unmatched", label: "Unmatched" },
    { value: "received", label: "Received" },
    { value: "approved", label: "Approved" },
    { value: "disputed", label: "Disputed" },
    { value: "paid", label: "Paid" },
  ]
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="AP Invoice Register">
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ fontSize: "0.85rem" }}>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {rows && rows.length > 0 && (
          <button onClick={() => downloadCsv("ap-register.csv",
            ["PO No","Supplier","PO Date","Inv No","Booked-In £","Matched Net £","VAT £","Status"],
            rows.map(r => [r.order_no, r.supplier_name || r.supplier_account, r.order_date ?? "",
              r.supplier_invoice_no ?? "", r.booked_in_gbp.toFixed(2),
              r.matched_net_gbp > 0 ? r.matched_net_gbp.toFixed(2) : "",
              r.matched_vat_gbp > 0 ? r.matched_vat_gbp.toFixed(2) : "",
              r.matched_status ?? "unmatched"])
          )}>Export CSV</button>
        )}
      </Toolbar>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
        Purchase orders that have been booked-in or invoice-matched. Match invoices on individual PO records.
      </p>
      {rows && rows.length === 0 && <p className="state-msg">No records found.</p>}
      {rows && rows.length > 0 && (
        <div className="detail-lines">
          <table>
            <thead>
              <tr>
                <th>PO No</th><th>Supplier</th><th>PO Date</th>
                <th>Supplier Inv No</th><th className="r">Booked-In £</th>
                <th className="r">Matched Net £</th><th className="r">VAT £</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.order_no}>
                  <td><a href={`#/${company}/purchase-orders/${encodeURIComponent(r.order_no)}`}><code>{r.order_no}</code></a></td>
                  <td>{r.supplier_name || r.supplier_account}</td>
                  <td>{r.order_date || "—"}</td>
                  <td>{r.supplier_invoice_no || <span style={{ color: "var(--color-text-muted,#888)" }}>—</span>}</td>
                  <td className="r">£{r.booked_in_gbp.toFixed(2)}</td>
                  <td className="r">{r.matched_net_gbp > 0 ? `£${r.matched_net_gbp.toFixed(2)}` : "—"}</td>
                  <td className="r">{r.matched_vat_gbp > 0 ? `£${r.matched_vat_gbp.toFixed(2)}` : "—"}</td>
                  <td>
                    {r.matched_status ? <Badge value={r.matched_status} /> : <span style={{ color: "var(--color-text-muted,#888)" }}>unmatched</span>}
                    {r.matched_status === "received" && (
                      <button style={{ marginLeft: "0.4rem", fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                        onClick={async () => {
                          try { await api.purchases.invoiceMatch(company, r.order_no, { matched_status: "approved" }); setRev(v => v + 1) }
                          catch (e) { alert(String(e)) }
                        }}>Approve</button>
                    )}
                    {r.matched_status === "approved" && (
                      <button style={{ marginLeft: "0.4rem", fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                        onClick={async () => {
                          try { await api.purchases.invoiceMatch(company, r.order_no, { matched_status: "paid" }); setRev(v => v + 1) }
                          catch (e) { alert(String(e)) }
                        }}>Mark paid</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

// ── Audit log viewer (admin) ──────────────────────────────────────────────────

export function AuditLog({ company }: { company: string }) {
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [table, setTable] = useState("")
  const reload = useCallback(() => {
    setLoading(true)
    api.admin.auditLog({ table_name: table || undefined, limit: 100 }).then(setRows).catch(console.error).finally(() => setLoading(false))
  }, [table])
  useEffect(() => { reload() }, [reload])

  return (
    <Shell loading={loading} error={null}>
      <Toolbar title="Audit log">
        <input placeholder="Filter by table" value={table} onChange={e => setTable(e.target.value)} />
      </Toolbar>
      <p style={{ fontSize: "0.8rem", color: "var(--muted,#888)" }}>Read-only trail of every insert/update/delete on audited tables (company: {company}).</p>
      <table>
        <thead><tr><th>When</th><th>Schema</th><th>Table</th><th>Record</th><th>Action</th><th>Changed by</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.changed_at?.slice(0, 19).replace("T", " ")}</td>
              <td>{r.schema_name}</td>
              <td>{r.table_name}</td>
              <td>{r.record_id || "—"}</td>
              <td><Badge value={r.action} /></td>
              <td title={r.changed_by || ""}>{r.changed_by_email || r.changed_by || "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="state-msg">No audit entries.</td></tr>}
        </tbody>
      </table>
    </Shell>
  )
}

// ── Admin: cut pricing (saw types + pricing rules) ────────────────────────────

function CutPricingAdmin({ company }: { company: string }) {
  const [sawRev, setSawRev] = useState(0)
  const [ruleRev, setRuleRev] = useState(0)
  const [sawMsg, setSawMsg] = useState<string | null>(null)
  const [ruleMsg, setRuleMsg] = useState<string | null>(null)
  const [newSaw, setNewSaw] = useState({ name: "", kerf_mm: "1.5", cost_per_cut: "" })
  const [newRule, setNewRule] = useState({ stock_account_code: "", facing_allowance_mm: "1.0", extra_loss_pct: "0", min_usable_length_mm: "80" })

  const { data: saws } = useData<SawType[]>(() => api.cutPricing.sawTypes(company, false), [company, sawRev])
  const { data: rules } = useData<CutPricingRule[]>(() => api.cutPricing.listRules(company), [company, ruleRev])

  async function addSaw() {
    if (!newSaw.name.trim()) { setSawMsg("Name required"); return }
    try {
      await api.cutPricing.createSawType(company, {
        name: newSaw.name.trim(),
        kerf_mm: parseFloat(newSaw.kerf_mm) || 1.5,
        cost_per_cut: newSaw.cost_per_cut ? parseFloat(newSaw.cost_per_cut) : undefined,
      })
      setNewSaw({ name: "", kerf_mm: "1.5", cost_per_cut: "" }); setSawRev(r => r + 1); setSawMsg("Saw type added")
    } catch (e) { setSawMsg(String(e)) }
  }

  async function toggleSaw(s: SawType) {
    try { await api.cutPricing.updateSawType(company, s.id, { is_active: !s.is_active }); setSawRev(r => r + 1) }
    catch (e) { setSawMsg(String(e)) }
  }

  async function addRule() {
    try {
      await api.cutPricing.createRule(company, {
        stock_account_code: newRule.stock_account_code.trim() || undefined,
        facing_allowance_mm: parseFloat(newRule.facing_allowance_mm) || 1.0,
        extra_loss_pct: parseFloat(newRule.extra_loss_pct) || 0,
        min_usable_length_mm: parseFloat(newRule.min_usable_length_mm) || 80,
      })
      setNewRule({ stock_account_code: "", facing_allowance_mm: "1.0", extra_loss_pct: "0", min_usable_length_mm: "80" })
      setRuleRev(r => r + 1); setRuleMsg("Rule added")
    } catch (e) { setRuleMsg(String(e)) }
  }

  return (
    <>
      <div className="detail-lines">
        <h3>Saw types</h3>
        {sawMsg && <p className="badge" style={{ marginBottom: "0.5rem" }}>{sawMsg}</p>}
        <table>
          <thead><tr><th>Name</th><th className="r">Kerf (mm)</th><th className="r">Cost / cut (£)</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(saws ?? []).map(s => (
              <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                <td>{s.name}</td>
                <td className="r">{s.kerf_mm}</td>
                <td className="r">{s.cost_per_cut != null ? s.cost_per_cut.toFixed(2) : "—"}</td>
                <td><Badge value={s.is_active ? "active" : "inactive"} /></td>
                <td><button style={{ fontSize: "0.75rem" }} onClick={() => toggleSaw(s)}>{s.is_active ? "Deactivate" : "Activate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.75rem" }}>
          <input placeholder="Saw name" value={newSaw.name} onChange={e => setNewSaw(p => ({ ...p, name: e.target.value }))} style={{ minWidth: "12em" }} />
          <input type="number" placeholder="Kerf mm" value={newSaw.kerf_mm} onChange={e => setNewSaw(p => ({ ...p, kerf_mm: e.target.value }))} style={{ width: "7em" }} />
          <input type="number" placeholder="£ / cut" value={newSaw.cost_per_cut} onChange={e => setNewSaw(p => ({ ...p, cost_per_cut: e.target.value }))} style={{ width: "7em" }} />
          <button className="action-btn" onClick={addSaw}>Add saw type</button>
        </div>
      </div>

      <div className="detail-lines">
        <h3>Cut pricing rules</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted,#888)", marginTop: 0 }}>
          Global rule (no stock code) applies to all items. Per-stock-code rules override it.
        </p>
        {ruleMsg && <p className="badge" style={{ marginBottom: "0.5rem" }}>{ruleMsg}</p>}
        <table>
          <thead><tr><th>Stock code</th><th className="r">Facing (mm)</th><th className="r">Extra loss %</th><th className="r">Min usable (mm)</th></tr></thead>
          <tbody>
            {(rules ?? []).map(r => (
              <tr key={r.id}>
                <td>{r.stock_account_code ? <code>{r.stock_account_code}</code> : <em>Global default</em>}</td>
                <td className="r">{r.facing_allowance_mm}</td>
                <td className="r">{r.extra_loss_pct}</td>
                <td className="r">{r.min_usable_length_mm}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.75rem" }}>
          <input placeholder="Stock code (blank = global)" value={newRule.stock_account_code}
            onChange={e => setNewRule(p => ({ ...p, stock_account_code: e.target.value }))} style={{ minWidth: "10em" }} />
          <input type="number" placeholder="Facing mm" value={newRule.facing_allowance_mm}
            onChange={e => setNewRule(p => ({ ...p, facing_allowance_mm: e.target.value }))} style={{ width: "8em" }} />
          <input type="number" placeholder="Extra loss %" value={newRule.extra_loss_pct}
            onChange={e => setNewRule(p => ({ ...p, extra_loss_pct: e.target.value }))} style={{ width: "8em" }} />
          <input type="number" placeholder="Min usable mm" value={newRule.min_usable_length_mm}
            onChange={e => setNewRule(p => ({ ...p, min_usable_length_mm: e.target.value }))} style={{ width: "9em" }} />
          <button className="action-btn" onClick={addRule}>Add rule</button>
        </div>
      </div>
    </>
  )
}

// ── Admin: users (memberships) + settings ─────────────────────────────────────

const ROLE_OPTIONS = ["admin", "manager", "sales", "production", "warehouse", "accounts", "readonly"]

export function AdminUsers({ company }: { company: string }) {
  const [users, setUsers] = useState<Member[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("readonly")
  const [msg, setMsg] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.admin.users(company).then(setUsers),
      api.admin.settings(company).then(setSettings),
    ]).catch(e => setMsg(String(e))).finally(() => setLoading(false))
  }, [company])
  useEffect(() => { reload() }, [reload])

  async function invite() {
    if (!email.trim()) return
    try { await api.admin.invite(company, email.trim(), role); setEmail(""); setMsg(`Invited ${email.trim()}`); reload() }
    catch (e) { setMsg(String(e)) }
  }
  async function changeRole(id: number, r: string) {
    try { await api.admin.setRole(id, r); reload() } catch (e) { setMsg(String(e)) }
  }
  async function toggle(m: Member) {
    try { await api.admin.setStatus(m.id, m.status === "disabled" ? "active" : "disabled"); reload() } catch (e) { setMsg(String(e)) }
  }
  async function saveSetting(key: string, value: string) {
    try { await api.admin.putSetting(company, key, value); setMsg(`Saved ${key}`) } catch (e) { setMsg(String(e)) }
  }

  return (
    <Shell loading={loading} error={null}>
      <Toolbar title={`Admin — ${company}`} />
      {msg && <p className="badge" style={{ marginBottom: "0.75rem" }}>{msg}</p>}

      <div className="detail-lines">
        <h3>Invite a user</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.75rem" }}>
          <input placeholder="email@company.com" value={email} onChange={e => setEmail(e.target.value)} style={{ minWidth: "16em" }} />
          <select value={role} onChange={e => setRole(e.target.value)}>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="action-btn" onClick={invite}>Invite</button>
          <span style={{ fontSize: "0.8rem", color: "var(--muted,#888)" }}>They join {company} on first login.</span>
        </div>
      </div>

      <div className="detail-lines">
        <h3>Members</h3>
        <table>
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {users.map(m => (
              <tr key={m.id}>
                <td>{m.email || <em>(pending id {m.user_id?.slice(0, 8)})</em>}</td>
                <td>
                  <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td><Badge value={m.status} /></td>
                <td>{m.created_at?.slice(0, 10)}</td>
                <td><button onClick={() => toggle(m)}>{m.status === "disabled" ? "Enable" : "Disable"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CompanyProfile company={company} settings={settings} onSave={saveSetting} />

      <CutPricingAdmin company={company} />

      <div className="detail-lines">
        <h3>Other settings</h3>
        <table>
          <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
          <tbody>
            {settings.filter(s => !s.key.startsWith("company.")).map(s => <SettingRow key={s.key} s={s} onSave={saveSetting} />)}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}

// QuickBooks-style company profile — printed on every external document (invoices,
// delivery notes, POs). Stored as `company.*` keys in app_settings.
const PROFILE_FIELDS: { key: string; label: string; wide?: boolean; area?: boolean }[] = [
  { key: "legal_name", label: "Registered company name", wide: true },
  { key: "trading_name", label: "Trading name" },
  { key: "logo_url", label: "Logo URL" },
  { key: "address_line1", label: "Address line 1" },
  { key: "address_line2", label: "Address line 2" },
  { key: "address_line3", label: "Address line 3" },
  { key: "city", label: "Town / city" },
  { key: "postcode", label: "Postcode" },
  { key: "country", label: "Country" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "reg_number", label: "Company reg. number" },
  { key: "vat_number", label: "VAT number" },
  { key: "currency", label: "Currency (e.g. GBP)" },
  { key: "date_format", label: "Date format (UK: dd/mm/yyyy)" },
  { key: "bank_name", label: "Bank name" },
  { key: "bank_sort_code", label: "Sort code" },
  { key: "bank_account", label: "Account number" },
  { key: "bank_iban", label: "IBAN / BIC" },
  { key: "terms", label: "Default terms / document footer", wide: true, area: true },
]

function CompanyProfile({ company, settings, onSave }: {
  company: string; settings: Setting[]; onSave: (k: string, v: string) => void
}) {
  const initial = () => Object.fromEntries(PROFILE_FIELDS.map(f =>
    [f.key, settings.find(s => s.key === "company." + f.key)?.value ?? ""]))
  const [vals, setVals] = useState<Record<string, string>>(initial)
  const [saving, setSaving] = useState(false)
  useEffect(() => setVals(initial()), [settings])  // refill when settings load
  const dirty = PROFILE_FIELDS.some(f =>
    vals[f.key] !== (settings.find(s => s.key === "company." + f.key)?.value ?? ""))
  async function save() {
    setSaving(true)
    for (const f of PROFILE_FIELDS) {
      const was = settings.find(s => s.key === "company." + f.key)?.value ?? ""
      if (vals[f.key] !== was) await onSave("company." + f.key, vals[f.key])
    }
    setSaving(false)
  }
  return (
    <div className="detail-lines">
      <h3>Company profile</h3>
      <p style={{ fontSize: ".82rem", color: "var(--text-muted)", marginBottom: ".75rem" }}>
        Printed on all external documents for {company} — invoices, delivery notes, purchase orders.
      </p>
      <div className="profile-grid">
        {PROFILE_FIELDS.map(f => f.key === "logo_url" ? (
          <label key={f.key} className="profile-label" style={{ gridColumn: "1 / -1" }}>
            Company logo
            <div className="logo-box">
              {vals.logo_url
                ? <img className="logo-preview" src={vals.logo_url} alt="logo" />
                : <span style={{ color: "var(--text-muted)", fontSize: ".8rem" }}>No logo uploaded</span>}
              <input type="file" accept="image/*" onChange={e => {
                const file = e.target.files?.[0]; if (!file) return
                const reader = new FileReader()
                reader.onload = () => setVals(v => ({ ...v, logo_url: String(reader.result) }))
                reader.readAsDataURL(file)
              }} />
              {vals.logo_url && <button onClick={() => setVals(v => ({ ...v, logo_url: "" }))}>Remove</button>}
            </div>
          </label>
        ) : (
          <label key={f.key} className="profile-label" style={f.wide ? { gridColumn: "1 / -1" } : undefined}>
            {f.label}
            {f.area
              ? <textarea rows={2} value={vals[f.key]} onChange={e => setVals({ ...vals, [f.key]: e.target.value })} />
              : <input value={vals[f.key]} onChange={e => setVals({ ...vals, [f.key]: e.target.value })} />}
          </label>
        ))}
      </div>
      <div className="profile-actions">
        <button className="action-btn" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  )
}

type WLine = { stock_account_code: string; short_description: string; qty_ordered: number; price: string; batch_no: string; price_unit: string; line_notes: string; resolving?: boolean; resolveMatches?: { account_code: string; description_1: string | null }[]; is_cut_piece?: boolean; cut_length_mm?: number; saw_type_id?: number; margin_pct?: number; cut_breakdown?: import("./api").CutPriceResult | null; price_is_override?: boolean; calculating?: boolean; grade_code?: string; required_cert_type?: string; material_type?: string; specification?: string; surcharge_confirmed?: boolean; processing?: unknown[] }

export function SalesOrderNew({ company }: { company: string }) {
  const [orderNo, setOrderNo] = useState<string | null>(null)
  const [stage, setStage] = useState(1)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [findings, setFindings] = useState<Finding[]>([])
  const [totals, setTotals] = useState<{ net: number; vat: number; gross: number }>({ net: 0, vat: 0, gross: 0 })
  const [stockOverrides, setStockOverrides] = useState<string[]>([])  // batch_nos physically verified

  // Stage 1
  const [customer, setCustomer] = useState("")
  const [deliveryDate, setDeliveryDate] = useState("")
  const [customerRef, setCustomerRef] = useState("")
  // Stage 2
  const [lines, setLines] = useState<WLine[]>([])
  const [poFiles, setPoFiles] = useState<File[]>([])
  const [poExtracting, setPoExtracting] = useState(false)
  const poFileRef = useRef<HTMLInputElement>(null)
  // B4: AI customer PO capture
  const [captureFiles, setCaptureFiles] = useState<File[]>([])
  const [capturing, setCapturing] = useState(false)
  const [captureWarnings, setCaptureWarnings] = useState<string[]>([])
  const captureFileRef = useRef<HTMLInputElement>(null)
  // Stage 4-5
  const [orderNotes, setOrderNotes] = useState("")
  const [carriageMethod, setCarriageMethod] = useState("")
  const [deliveryAddr, setDeliveryAddr] = useState({ line1: "", line2: "", line3: "", line4: "", postcode: "" })
  const { data: custDetail } = useData<import("./api").CustomerDetail>(
    () => customer ? api.customers.get(company, customer) : Promise.resolve(null as any),
    [company, customer]
  )
  const { data: sawTypes } = useData(() => api.cutPricing.sawTypes(company), [company])

  useEffect(() => {
    let live = true
    const stKey = `draft_so_${company}`
    const oldNo = sessionStorage.getItem(stKey)
    const doCreate = () => {
      api.soWizard.createDraft(company)
        .then(r => { if (live) { sessionStorage.setItem(stKey, r.order_no); setOrderNo(r.order_no) } })
        .catch(e => { if (live) setErr(String(e)) })
    }
    if (oldNo) {
      api.soWizard.abandon(company, oldNo).catch(() => {}).finally(() => { if (live) doCreate() })
    } else {
      doCreate()
    }
    return () => { live = false }
  }, [company])

  async function save() {
    if (!orderNo) return
    const body: WizardPatch = {
      customer_account: customer.trim() || undefined,
      delivery_date: deliveryDate || undefined,
      customer_ref: customerRef.trim() || undefined,
      order_notes: orderNotes || undefined,
      carriage_method: carriageMethod || undefined,
      delivery_address_line_1: deliveryAddr.line1 || undefined,
      delivery_address_line_2: deliveryAddr.line2 || undefined,
      delivery_address_line_3: deliveryAddr.line3 || undefined,
      delivery_address_line_4: deliveryAddr.line4 || undefined,
      delivery_postcode: deliveryAddr.postcode || undefined,
      lines: lines.map(l => ({
        stock_account_code: l.stock_account_code || undefined,
        short_description: l.short_description || undefined,
        qty_ordered: Number(l.qty_ordered) || 0,
        price: l.price ? Math.round(parseFloat(l.price) * 100) : 0,
        batch_no: l.batch_no || undefined,
        price_unit: l.price_unit || undefined,
        line_notes: l.line_notes || undefined,
        is_cut_piece: !!l.is_cut_piece,
        cut_length_mm: l.cut_length_mm,
        saw_type_id: l.saw_type_id,
        margin_pct: l.margin_pct,
        price_is_override: !!l.price_is_override,
        cut_price_breakdown: l.cut_breakdown,
        grade_code: l.grade_code || undefined,
        required_cert_type: l.required_cert_type || undefined,
        material_type: l.material_type || undefined,
        specification: l.specification || undefined,
        surcharge_confirmed: l.surcharge_confirmed,
        processing: l.processing || undefined,
      })),
    }
    const r = await api.soWizard.patch(company, orderNo, body)
    setTotals({ net: r.net_gbp, vat: r.vat_gbp, gross: r.total_gbp })
  }

  async function next() {
    if (!orderNo) return
    setBusy(true); setErr(null); setFindings([])
    try {
      await save()
      const r = await api.soWizard.advance(company, orderNo, stage, stockOverrides)
      setFindings(r.findings)
      if (r.can_advance) { setStage(s => Math.min(6, s + 1)); setStockOverrides([]) }
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  async function confirm() {
    if (!orderNo) return
    setBusy(true); setErr(null); setFindings([])
    try {
      await save()
      const r = await api.soWizard.confirm(company, orderNo)
      sessionStorage.removeItem(`draft_so_${company}`)
      location.hash = `#/${company}/sales-orders/${encodeURIComponent(r.order_no)}`
    } catch (e) { setErr(String(e)); setBusy(false) }
  }

  function addLine() {
    setLines([...lines, { stock_account_code: "", short_description: "", qty_ordered: 1, price: "", batch_no: "", price_unit: "KG", line_notes: "" }])
  }
  function setLine(i: number, patch: Partial<WLine>) {
    setLines(lines.map((l, j) => j === i ? { ...l, ...patch } : l))
  }

  async function resolveGrade(i: number) {
    const desc = lines[i].short_description.trim()
    if (!desc) return
    setLine(i, { resolving: true, resolveMatches: undefined })
    try {
      const result = await api.stock.resolve(company, desc)
      setLine(i, { resolving: false, resolveMatches: result.matches })
    } catch { setLine(i, { resolving: false, resolveMatches: [] }) }
  }

  async function calcCutPrice(i: number, l: WLine) {
    if (!l.stock_account_code || !l.saw_type_id || !l.cut_length_mm || !l.qty_ordered) return
    setLine(i, { calculating: true })
    try {
      const r = await api.cutPricing.calculate(company, {
        stock_account_code: l.stock_account_code,
        saw_type_id: l.saw_type_id,
        cut_length_mm: l.cut_length_mm,
        qty: Number(l.qty_ordered),
        margin_pct: l.margin_pct ?? 0,
      })
      setLine(i, {
        cut_breakdown: r, price: String(r.price_per_piece),
        price_unit: "EACH", price_is_override: false, calculating: false,
      })
    } catch (e) { alert(String(e)); setLine(i, { calculating: false }) }
  }

  async function extractFromPO() {
    if (!poFiles.length) return
    setPoExtracting(true); setErr(null)
    try {
      const result = await api.soWizard.extract(company, poFiles)
      if (result.customer_ref) setCustomerRef(result.customer_ref)
      if (result.delivery_date) setDeliveryDate(result.delivery_date)
      const extracted: WLine[] = (result.lines ?? []).map(l => ({
        stock_account_code: "",
        short_description: l.description || "",
        qty_ordered: l.qty ?? 1,
        price: "",
        batch_no: "",
        price_unit: l.unit || "KG",
        line_notes: l.notes || "",
      }))
      if (extracted.length) setLines(extracted)
    } catch (e) { setErr(String(e)) }
    finally { setPoExtracting(false) }
  }

  async function captureCustomerPo() {
    if (!captureFiles.length) return
    setCapturing(true); setErr(null); setCaptureWarnings([])
    try {
      const result = await api.soWizard.aiCapturePo(company, captureFiles)
      const { draft_so, extraction_warnings } = result
      if (draft_so.customer_account) setCustomer(draft_so.customer_account)
      if (draft_so.customer_ref) setCustomerRef(draft_so.customer_ref)
      if (draft_so.delivery_date) setDeliveryDate(draft_so.delivery_date)
      const extracted: WLine[] = (draft_so.lines ?? []).map(l => ({
        stock_account_code: l.top_match ?? "",
        short_description: l.description || "",
        qty_ordered: l.qty ?? 1,
        price: "",
        batch_no: "",
        price_unit: l.unit || "KG",
        line_notes: "",
      }))
      if (extracted.length) setLines(extracted)
      setCaptureWarnings(extraction_warnings ?? [])
      setStage(2)
    } catch (e) { setErr(String(e)) }
    finally { setCapturing(false) }
  }

  return (
    <Shell loading={!orderNo && !err} error={null}>
      <a className="back-link" href={`#/${company}/sales-orders`}>← Sales Orders</a>
      <Toolbar title={orderNo ? `New Sales Order — ${orderNo}` : "New Sales Order"} />
      <StepBar stage={stage} onJump={setStage} />

      {findings.length > 0 && (
        <div className="gate-banner">
          {findings.map((f, i) => (
            <div key={i} className={`gate-msg gate-msg--${f.level}`}>{f.message}</div>
          ))}
          {findings.filter(f => f.code === "BATCH_OVERALLOC").map(f => {
            const bn = f.fields?.[0] === "batch_no" && f.message.match(/Batch ([^:]+)/)?.[1]
            if (!bn) return null
            const checked = stockOverrides.includes(bn)
            return (
              <label key={`ov-${bn}`} className="gate-msg gate-msg--warn" style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input type="checkbox" checked={checked}
                  onChange={e => setStockOverrides(prev =>
                    e.target.checked ? [...prev, bn] : prev.filter(x => x !== bn))} />
                I have physically verified sufficient stock is available for batch {bn}
              </label>
            )
          })}
        </div>
      )}
      {err && <div className="gate-msg gate-msg--block">{err}</div>}

      {stage === 1 && (
        <div className="wizard-stage">
          <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "var(--color-surface-alt,#f7fafc)", borderRadius: "6px", border: "1px dashed var(--color-border,#e2e8f0)" }}>
            <strong style={{ fontSize: "0.85rem" }}>Upload Customer PO (AI capture)</strong>
            <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted,#888)", margin: "0.25rem 0 0.5rem" }}>
              Upload a customer purchase order PDF to auto-fill this form using AI.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="file" accept="application/pdf,image/*" multiple ref={captureFileRef} style={{ display: "none" }}
                onChange={e => setCaptureFiles(Array.from(e.target.files ?? []))} />
              <button className="action-btn" onClick={() => captureFileRef.current?.click()} style={{ fontSize: "0.82rem" }}>
                {captureFiles.length ? `${captureFiles.length} file${captureFiles.length !== 1 ? "s" : ""} selected` : "Choose PO PDF…"}
              </button>
              {captureFiles.length > 0 && (
                <button className="action-btn" disabled={capturing} onClick={captureCustomerPo} style={{ fontSize: "0.82rem" }}>
                  {capturing ? "Extracting…" : "Extract & pre-fill"}
                </button>
              )}
            </div>
            {captureWarnings.length > 0 && (
              <ul style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "#a06000", paddingLeft: "1.25rem" }}>
                {captureWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>Customer account&nbsp;</label>
            <CustomerPicker company={company} value={customer} onChange={setCustomer} />
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <label>Required delivery date&nbsp;</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
          </div>
          <div>
            <label>Customer reference (their PO number)&nbsp;</label>
            <input value={customerRef} onChange={e => setCustomerRef(e.target.value)} style={{ width: "14em" }} />
          </div>
        </div>
      )}

      {stage === 2 && (
        <div className="wizard-stage">
          <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <input type="file" accept="application/pdf,image/*" multiple ref={poFileRef} style={{ display: "none" }}
              onChange={e => setPoFiles(Array.from(e.target.files ?? []))} />
            <button className="action-btn" onClick={() => poFileRef.current?.click()}>
              {poFiles.length ? `${poFiles.length} file${poFiles.length !== 1 ? "s" : ""} selected` : "Upload customer PO"}
            </button>
            {poFiles.length > 0 && (
              <button className="action-btn" disabled={poExtracting} onClick={extractFromPO}>
                {poExtracting ? "Extracting…" : "Pre-fill from PO"}
              </button>
            )}
          </div>
          <table>
            <thead><tr><th>Code</th><th>Batch</th><th>Description</th><th>Grade</th><th>Cert</th><th>Qty</th><th>Price basis</th><th>Unit £</th><th>Line notes</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td><StockPicker company={company} value={l.stock_account_code}
                    onPick={(code, item) => setLine(i, item
                      ? { stock_account_code: code, batch_no: "", short_description: item.description_1 || item.short_description || l.short_description }
                      : { stock_account_code: code, batch_no: "" })} /></td>
                  <td><BatchPicker company={company} stockCode={l.stock_account_code} value={l.batch_no}
                    onPick={b => setLine(i, { batch_no: b.batch_no })} /></td>
                  <td>
                    <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                      <input value={l.short_description} onChange={e => setLine(i, { short_description: e.target.value, resolveMatches: undefined })} />
                      {!l.stock_account_code && <button style={{ fontSize: "0.75rem", padding: "0 0.3rem" }} disabled={l.resolving || !l.short_description.trim()} onClick={() => resolveGrade(i)} title="Find stock code from description">{l.resolving ? "…" : "Find"}</button>}
                    </div>
                    {l.resolveMatches && l.resolveMatches.length > 0 && (
                      <select size={Math.min(4, l.resolveMatches.length)} style={{ width: "100%", marginTop: "0.2rem", fontSize: "0.8rem" }}
                        onChange={e => { if (e.target.value) setLine(i, { stock_account_code: e.target.value, resolveMatches: undefined }) }}>
                        <option value="">— select match —</option>
                        {l.resolveMatches.map(m => <option key={m.account_code} value={m.account_code}>{m.account_code} — {m.description_1}</option>)}
                      </select>
                    )}
                    {l.resolveMatches && l.resolveMatches.length === 0 && <small style={{ color: "var(--color-warn,#a06000)" }}>No matches found</small>}
                    {/* Cut-piece inputs */}
                    <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "0.2rem", fontSize: "0.8rem" }}>
                      <input type="checkbox" checked={!!l.is_cut_piece} onChange={e => setLine(i, { is_cut_piece: e.target.checked, cut_breakdown: null, price_is_override: false })} />
                      Cut piece
                    </label>
                    {l.is_cut_piece && (
                      <div style={{ marginTop: "0.3rem", display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.8rem" }}>
                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                          <label>Length (mm)
                            <input type="number" min="1" style={{ width: "5em", marginLeft: "0.25rem" }}
                              value={l.cut_length_mm ?? ""} onChange={e => setLine(i, { cut_length_mm: parseFloat(e.target.value) || undefined, cut_breakdown: null })} />
                          </label>
                          <label>Saw
                            <select style={{ marginLeft: "0.25rem" }} value={l.saw_type_id ?? ""} onChange={e => setLine(i, { saw_type_id: Number(e.target.value) || undefined, cut_breakdown: null })}>
                              <option value="">—</option>
                              {(sawTypes ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </label>
                          <label>Margin %
                            <input type="number" min="0" step="0.1" style={{ width: "4em", marginLeft: "0.25rem" }}
                              value={l.margin_pct ?? ""} onChange={e => setLine(i, { margin_pct: parseFloat(e.target.value) || undefined, cut_breakdown: null })} />
                          </label>
                          <button disabled={l.calculating || !l.stock_account_code || !l.saw_type_id || !l.cut_length_mm}
                            onClick={() => calcCutPrice(i, l)} style={{ fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}>
                            {l.calculating ? "…" : "Calculate"}
                          </button>
                        </div>
                        {l.cut_breakdown?.short_cut_flag && (
                          <div style={{ color: "var(--color-warn,#a06000)", fontWeight: 600 }}>
                            ⚠ Short cut (min usable: {l.cut_breakdown.min_usable_length_mm}mm)
                          </div>
                        )}
                        {l.cut_breakdown && !l.price_is_override && (
                          <details style={{ fontSize: "0.75rem" }}>
                            <summary style={{ cursor: "pointer" }}>Price breakdown</summary>
                            <table style={{ marginTop: "0.2rem", borderCollapse: "collapse" }}>
                              <tbody>
                                <tr><td>Chargeable length</td><td style={{ paddingLeft: "0.5rem" }}>{l.cut_breakdown.chargeable_length_mm} mm</td></tr>
                                <tr><td>Chargeable weight</td><td style={{ paddingLeft: "0.5rem" }}>{l.cut_breakdown.chargeable_weight_kg.toFixed(4)} kg</td></tr>
                                <tr><td>Material cost</td><td style={{ paddingLeft: "0.5rem" }}>£{l.cut_breakdown.material_cost_per_piece.toFixed(4)}</td></tr>
                                <tr><td>Sawing charge</td><td style={{ paddingLeft: "0.5rem" }}>£{l.cut_breakdown.sawing_cost_per_piece.toFixed(2)}</td></tr>
                                <tr><td>Cost/piece</td><td style={{ paddingLeft: "0.5rem" }}>£{l.cut_breakdown.cost_per_piece.toFixed(4)}</td></tr>
                                <tr><td><strong>Price/piece</strong></td><td style={{ paddingLeft: "0.5rem" }}><strong>£{l.cut_breakdown.price_per_piece.toFixed(2)}</strong></td></tr>
                                <tr><td>Line total ({l.qty_ordered} pcs)</td><td style={{ paddingLeft: "0.5rem" }}>£{l.cut_breakdown.line_total.toFixed(2)}</td></tr>
                              </tbody>
                            </table>
                          </details>
                        )}
                      </div>
                    )}
                  </td>
                  <td><input style={{ width: "5em" }} placeholder="e.g. 316L" value={l.grade_code ?? ""} onChange={e => setLine(i, { grade_code: e.target.value.toUpperCase() || undefined })} /></td>
                  <td>
                    <select value={l.required_cert_type ?? ""} onChange={e => setLine(i, { required_cert_type: e.target.value || undefined })}>
                      <option value="">—</option>
                      <option value="2.1">2.1</option>
                      <option value="2.2">2.2</option>
                      <option value="3.1">3.1</option>
                      <option value="3.2">3.2</option>
                    </select>
                  </td>
                  <td><input style={{ width: "4em" }} value={l.qty_ordered} onChange={e => setLine(i, { qty_ordered: Number(e.target.value) || 0 })} /></td>
                  <td>
                    {l.is_cut_piece
                      ? <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted,#888)" }}>each</span>
                      : <select value={l.price_unit} onChange={e => setLine(i, { price_unit: e.target.value })}>
                          <option value="KG">per kg</option>
                          <option value="T">per tonne</option>
                          <option value="EACH">each</option>
                          <option value="M">per metre</option>
                          <option value="LUMP">lump sum</option>
                        </select>
                    }
                  </td>
                  <td>
                    <input style={{ width: "5em" }} value={l.price}
                      onChange={e => setLine(i, { price: e.target.value, price_is_override: !!l.is_cut_piece })} />
                    {l.is_cut_piece && l.price_is_override && <div style={{ fontSize: "0.7rem", color: "var(--color-warn,#a06000)" }}>override</div>}
                  </td>
                  <td><input style={{ width: "12em" }} placeholder="e.g. min 4m lengths" value={l.line_notes} onChange={e => setLine(i, { line_notes: e.target.value })} /></td>
                  <td><button style={{ fontSize: "0.75rem", padding: "0 0.3rem" }} aria-label="Remove line" title="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td colSpan={10} className="state-msg">Add a line.</td></tr>}
            </tbody>
          </table>
          <button onClick={addLine} style={{ marginTop: "0.5rem" }}>+ Add line</button>
        </div>
      )}

      {stage === 3 && (
        <div className="wizard-stage">
          <h3 style={{ margin: "0 0 0.75rem" }}>Review pricing</h3>
          <table className="data-table">
            <thead><tr><th>Description</th><th>Grade</th><th>Qty</th><th>Unit</th><th>Price (£)</th><th style={{ textAlign: "right" }}>Line total</th><th title="Tick to confirm alloy surcharge is included in price">Surcharge confirmed</th></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const p = parseFloat(l.price) || 0
                const total = (l.qty_ordered * p).toFixed(2)
                return (
                  <tr key={i}>
                    <td>{l.short_description || <em>—</em>}</td>
                    <td>{l.grade_code ? <code>{l.grade_code}</code> : <em>—</em>}</td>
                    <td>{l.qty_ordered}</td>
                    <td>
                      <select value={l.price_unit} onChange={e => setLine(i, { price_unit: e.target.value })}>
                        {["KG", "T", "M", "EACH", "LUMP"].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td><input type="number" step="0.01" style={{ width: "7em" }} value={l.price}
                      onChange={e => setLine(i, { price: e.target.value })} /></td>
                    <td style={{ textAlign: "right" }}>{fmtGbp(parseFloat(total))}</td>
                    <td style={{ textAlign: "center" }}>
                      {l.grade_code
                        ? <input type="checkbox" checked={!!l.surcharge_confirmed}
                            onChange={e => setLine(i, { surcharge_confirmed: e.target.checked })}
                            title="Confirm alloy surcharge is included in the unit price" />
                        : <em style={{ fontSize: "0.75rem", color: "var(--color-text-muted,#888)" }}>N/A</em>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {stage === 4 && (
        <div className="wizard-stage">
          <h3 style={{ margin: "0 0 0.75rem" }}>Processing & notes</h3>
          {lines.some(l => l.stock_account_code) && <>
            <p style={{ fontSize: "0.85rem", color: "var(--color-muted,#6b7280)", marginBottom: "0.75rem" }}>
              Add processing operations per line (cut, subcontract, inspection). Leave empty to supply from stock as-is.
            </p>
            {lines.map((l, origIdx) => !l.stock_account_code ? null : (
              <div key={origIdx} style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border,#e2e8f0)", borderRadius: 6, padding: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <strong style={{ fontSize: "0.875rem" }}>Line {origIdx + 1}: {l.short_description || l.stock_account_code}</strong>
                  <button type="button" onClick={() => setLine(origIdx, { processing: [...(l.processing || []), { op: "cut" }] as unknown[] })}>+ Op</button>
                </div>
                {((l.processing || []) as { op?: string; supplier_account_code?: string }[]).map((op, oi) => (
                  <div key={oi} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem", alignItems: "center" }}>
                    <select value={op.op || "cut"} onChange={e => {
                      const ops = [...(l.processing || [])] as { op?: string; supplier_account_code?: string }[]
                      ops[oi] = { op: e.target.value, supplier_account_code: e.target.value === "subcontract" ? ops[oi].supplier_account_code : undefined }
                      setLine(origIdx, { processing: ops as unknown[] })
                    }}>
                      <option value="cut">Cut</option>
                      <option value="subcontract">Subcontract</option>
                      <option value="inspect">Inspect / QA</option>
                      <option value="other">Other</option>
                    </select>
                    {op.op === "subcontract" && (
                      <input type="text" placeholder="Supplier code" value={op.supplier_account_code || ""}
                        onChange={e => {
                          const ops = [...(l.processing || [])] as { op?: string; supplier_account_code?: string }[]
                          ops[oi] = { ...ops[oi], supplier_account_code: e.target.value }
                          setLine(origIdx, { processing: ops as unknown[] })
                        }} style={{ width: "10em" }} />
                    )}
                    <button type="button" onClick={() => {
                      setLine(origIdx, { processing: (l.processing || []).filter((_, j) => j !== oi) as unknown[] })
                    }}>✕</button>
                  </div>
                ))}
                {(!l.processing || !l.processing.length) && (
                  <p style={{ fontSize: "0.8rem", color: "var(--color-muted,#6b7280)", margin: 0 }}>No operations — stock supplied as-is.</p>
                )}
              </div>
            ))}
          </>}
          <label style={{ display: "block", marginBottom: "0.5rem", marginTop: lines.some(l => l.stock_account_code) ? "1rem" : 0 }}>Order notes</label>
          <textarea rows={4} style={{ width: "100%", maxWidth: "36em" }} value={orderNotes}
            onChange={e => setOrderNotes(e.target.value)}
            placeholder="Any special instructions, processing notes, or internal comments…" />
        </div>
      )}

      {stage === 5 && (
        <div className="wizard-stage">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>Delivery</h3>
            {custDetail && (custDetail.address_line_1 || custDetail.postcode) && (
              <button onClick={() => setDeliveryAddr({
                line1: custDetail.address_line_1 ?? "",
                line2: custDetail.address_line_2 ?? "",
                line3: custDetail.address_line_3 ?? "",
                line4: custDetail.address_line_4 ?? "",
                postcode: custDetail.postcode ?? "",
              })}>Fill from customer address</button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1.5rem", maxWidth: "40em" }}>
            <label>Carriage method</label>
            <select value={carriageMethod} onChange={e => setCarriageMethod(e.target.value)}>
              <option value="">— select —</option>
              <option>Own transport</option>
              <option>Customer collection</option>
              <option>Carrier</option>
              <option>Royal Mail</option>
            </select>
            <label>Address line 1</label>
            <input value={deliveryAddr.line1} onChange={e => setDeliveryAddr(a => ({ ...a, line1: e.target.value }))} />
            <label>Address line 2</label>
            <input value={deliveryAddr.line2} onChange={e => setDeliveryAddr(a => ({ ...a, line2: e.target.value }))} />
            <label>Town / city</label>
            <input value={deliveryAddr.line3} onChange={e => setDeliveryAddr(a => ({ ...a, line3: e.target.value }))} />
            <label>County</label>
            <input value={deliveryAddr.line4} onChange={e => setDeliveryAddr(a => ({ ...a, line4: e.target.value }))} />
            <label>Postcode</label>
            <input value={deliveryAddr.postcode} onChange={e => setDeliveryAddr(a => ({ ...a, postcode: e.target.value }))} />
          </div>
        </div>
      )}

      {stage === 6 && (
        <div className="wizard-stage">
          <h3 style={{ margin: "0 0 0.75rem" }}>Review &amp; confirm</h3>
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.25rem 1rem", marginBottom: "1rem" }}>
            <dt>Customer</dt><dd>{customer || "—"}</dd>
            {customerRef && <><dt>Customer ref</dt><dd>{customerRef}</dd></>}
            <dt>Delivery date</dt><dd>{fmtDate(deliveryDate) || "—"}</dd>
            <dt>Carriage</dt><dd>{carriageMethod || "—"}</dd>
            {deliveryAddr.line1 && <><dt>Delivery address</dt><dd>{[deliveryAddr.line1, deliveryAddr.line2, deliveryAddr.line3, deliveryAddr.line4, deliveryAddr.postcode].filter(Boolean).join(", ")}</dd></>}
            {orderNotes && <><dt>Notes</dt><dd>{orderNotes}</dd></>}
          </dl>
          <table className="data-table">
            <thead><tr><th>#</th><th>Stock code</th><th>Description</th><th>Qty</th><th>Unit</th><th style={{ textAlign: "right" }}>Total £</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><code>{l.stock_account_code || "—"}</code></td>
                  <td>{l.short_description || "—"}{l.line_notes && <small style={{ display: "block", color: "var(--color-text-muted,#888)" }}>{l.line_notes}</small>}</td>
                  <td>{l.qty_ordered}</td>
                  <td>{l.price_unit}</td>
                  <td style={{ textAlign: "right" }}>{fmtGbp((l.qty_ordered * (parseFloat(l.price) || 0)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="wizard-totals">
        Net {fmtGbp(totals.net)} · VAT {fmtGbp(totals.vat)} · Gross {fmtGbp(totals.gross)}
      </div>

      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
        <button disabled={stage === 1 || busy} onClick={() => setStage(s => Math.max(1, s - 1))}>← Back</button>
        {stage < 6
          ? <button className="action-btn" disabled={busy || !orderNo} onClick={next}>{busy ? "Checking…" : "Next →"}</button>
          : <button className="action-btn" disabled={busy || !orderNo} onClick={confirm}>{busy ? "Confirming…" : "Confirm order"}</button>}
      </div>
    </Shell>
  )
}

function SettingRow({ s, onSave }: { s: Setting; onSave: (k: string, v: string) => void }) {
  const [v, setV] = useState(s.value)
  return (
    <tr>
      <td><code>{s.key}</code></td>
      <td><input value={v} onChange={e => setV(e.target.value)} style={{ width: "8em" }} /></td>
      <td>{v !== s.value && <button className="action-btn" onClick={() => onSave(s.key, v)}>Save</button>}</td>
    </tr>
  )
}

// ── Fleet ─────────────────────────────────────────────────────────────────────

function ComplianceBadge({ compliance }: { compliance: { expired: string[]; expiring: string[] } }) {
  if (compliance.expired.length > 0)
    return <span className="badge badge--fail">Expired</span>
  if (compliance.expiring.length > 0)
    return <span className="badge badge--warn">Expiring</span>
  return <span className="badge badge--pass">OK</span>
}

function VehicleRow({ company, v, onSaved }: { company: string; v: Vehicle; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [reg, setReg] = useState(v.registration)
  const [mot, setMot] = useState(v.mot_expiry ?? "")
  const [ins, setIns] = useState(v.insurance_expiry ?? "")
  const [svc] = useState(v.service_due_date ?? "")
  const [active, setActive] = useState(v.is_active)
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    try {
      await api.fleet.updateVehicle(company, v.id, {
        registration: reg, vehicle_type: v.vehicle_type, max_payload_kg: v.max_payload_kg,
        bed_length_mm: v.bed_length_mm, mot_expiry: mot || null, insurance_expiry: ins || null,
        service_due_date: svc || null, is_active: active, notes: v.notes,
      })
      setEditing(false); setMsg(null); onSaved()
    } catch (e) { setMsg(String(e)) }
  }

  if (!editing) return (
    <tr key={v.id}>
      <td><strong>{v.registration}</strong></td>
      <td>{v.vehicle_type || "—"}</td>
      <td>{fmtDate(v.mot_expiry)}</td>
      <td>{fmtDate(v.insurance_expiry)}</td>
      <td>{v.max_payload_kg ?? "—"}</td>
      <td><Badge value={v.is_active ? "Active" : "Inactive"} /></td>
      <td><ComplianceBadge compliance={v.compliance} /></td>
      <td><button className="link-btn" onClick={() => setEditing(true)}>Edit</button></td>
    </tr>
  )
  return (
    <tr>
      <td><input value={reg} onChange={e => setReg(e.target.value)} style={{ width: "7rem" }} /></td>
      <td>{v.vehicle_type || "—"}</td>
      <td><input type="date" value={mot} onChange={e => setMot(e.target.value)} style={{ width: "9rem" }} /></td>
      <td><input type="date" value={ins} onChange={e => setIns(e.target.value)} style={{ width: "9rem" }} /></td>
      <td>{v.max_payload_kg ?? "—"}</td>
      <td><select value={active ? "1" : "0"} onChange={e => setActive(e.target.value === "1")}>
        <option value="1">Active</option><option value="0">Inactive</option>
      </select></td>
      <td>{msg && <span className="badge">{msg}</span>}</td>
      <td style={{ display: "flex", gap: "0.25rem" }}>
        <button className="action-btn" onClick={save}>Save</button>
        <button onClick={() => setEditing(false)}>Cancel</button>
      </td>
    </tr>
  )
}

function DriverRow({ company, d, onSaved }: { company: string; d: Driver; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [licExp, setLicExp] = useState(d.licence_expiry ?? "")
  const [cpc, setCpc] = useState(d.cpc_expiry ?? "")
  const [active, setActive] = useState(d.is_active)
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    try {
      await api.fleet.updateDriver(company, d.id, {
        first_name: d.first_name, last_name: d.last_name, licence_number: d.licence_number,
        licence_expiry: licExp || null, cpc_expiry: cpc || null, is_active: active, notes: d.notes,
      })
      setEditing(false); setMsg(null); onSaved()
    } catch (e) { setMsg(String(e)) }
  }

  if (!editing) return (
    <tr key={d.id}>
      <td><strong>{d.first_name} {d.last_name}</strong></td>
      <td>{d.licence_number || "—"}</td>
      <td>{fmtDate(d.licence_expiry)}</td>
      <td>{fmtDate(d.cpc_expiry)}</td>
      <td><Badge value={d.is_active ? "Active" : "Inactive"} /></td>
      <td><ComplianceBadge compliance={d.compliance} /></td>
      <td><button className="link-btn" onClick={() => setEditing(true)}>Edit</button></td>
    </tr>
  )
  return (
    <tr>
      <td><strong>{d.first_name} {d.last_name}</strong></td>
      <td>{d.licence_number || "—"}</td>
      <td><input type="date" value={licExp} onChange={e => setLicExp(e.target.value)} style={{ width: "9rem" }} /></td>
      <td><input type="date" value={cpc} onChange={e => setCpc(e.target.value)} style={{ width: "9rem" }} /></td>
      <td><select value={active ? "1" : "0"} onChange={e => setActive(e.target.value === "1")}>
        <option value="1">Active</option><option value="0">Inactive</option>
      </select></td>
      <td>{msg && <span className="badge">{msg}</span>}</td>
      <td><button className="action-btn" onClick={save}>Save</button>
        <button style={{ marginLeft: "0.25rem" }} onClick={() => setEditing(false)}>Cancel</button></td>
    </tr>
  )
}

export function Fleet({ company }: { company: string }) {
  const [rev, setRev] = useState(0)
  const { data: vehicles, loading: vLoad, error: vErr } = useData<Vehicle[]>(
    () => api.fleet.vehicles(company), [company, rev]
  )
  const { data: drivers, loading: dLoad, error: dErr } = useData<Driver[]>(
    () => api.fleet.drivers(company), [company, rev]
  )

  // Add vehicle form state
  const [vReg, setVReg] = useState("")
  const [vType, setVType] = useState("")
  const [vMot, setVMot] = useState("")
  const [vIns, setVIns] = useState("")
  const [vMsg, setVMsg] = useState<string | null>(null)
  const [vSaving, setVSaving] = useState(false)

  // Add driver form state
  const [dFirst, setDFirst] = useState("")
  const [dLast, setDLast] = useState("")
  const [dLicence, setDLicence] = useState("")
  const [dLicExp, setDLicExp] = useState("")
  const [dCpc, setDCpc] = useState("")
  const [dMsg, setDMsg] = useState<string | null>(null)
  const [dSaving, setDSaving] = useState(false)

  async function addVehicle() {
    if (!vReg.trim()) return
    setVSaving(true); setVMsg(null)
    try {
      await api.fleet.createVehicle(company, {
        registration: vReg.trim(),
        vehicle_type: vType || undefined,
        mot_expiry: vMot || undefined,
        insurance_expiry: vIns || undefined,
      })
      setVReg(""); setVType(""); setVMot(""); setVIns("")
      setVMsg("Vehicle added"); setRev(r => r + 1)
    } catch (e) { setVMsg(String(e)) }
    finally { setVSaving(false) }
  }

  async function addDriver() {
    if (!dFirst.trim() || !dLast.trim()) return
    setDSaving(true); setDMsg(null)
    try {
      await api.fleet.createDriver(company, {
        first_name: dFirst.trim(),
        last_name: dLast.trim(),
        licence_number: dLicence || undefined,
        licence_expiry: dLicExp || undefined,
        cpc_expiry: dCpc || undefined,
      })
      setDFirst(""); setDLast(""); setDLicence(""); setDLicExp(""); setDCpc("")
      setDMsg("Driver added"); setRev(r => r + 1)
    } catch (e) { setDMsg(String(e)) }
    finally { setDSaving(false) }
  }

  return (
    <>
      <Toolbar title="Fleet" />

      <h2 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem" }}>Vehicles</h2>
      <Shell loading={vLoad} error={vErr}>
        <table>
          <thead><tr>
            <th>Registration</th><th>Type</th><th>MOT expiry</th><th>Insurance expiry</th>
            <th>Max payload (kg)</th><th>Status</th><th>Compliance</th><th></th>
          </tr></thead>
          <tbody>
            {(vehicles ?? []).map(v => (
              <VehicleRow key={v.id} company={company} v={v} onSaved={() => setRev(r => r + 1)} />
            ))}
            {(vehicles ?? []).length === 0 && (
              <tr><td colSpan={8} className="state-msg">No vehicles.</td></tr>
            )}
          </tbody>
        </table>

        <details style={{ marginTop: "0.75rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>+ Add vehicle</summary>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "flex-end" }}>
            <label style={{ fontSize: "0.8rem" }}>Registration *<br />
              <input value={vReg} onChange={e => setVReg(e.target.value)} placeholder="e.g. AB12 CDE" /></label>
            <label style={{ fontSize: "0.8rem" }}>Type<br />
              <input value={vType} onChange={e => setVType(e.target.value)} placeholder="e.g. Flatbed" /></label>
            <label style={{ fontSize: "0.8rem" }}>MOT expiry<br />
              <input type="date" value={vMot} onChange={e => setVMot(e.target.value)} /></label>
            <label style={{ fontSize: "0.8rem" }}>Insurance expiry<br />
              <input type="date" value={vIns} onChange={e => setVIns(e.target.value)} /></label>
            <button className="action-btn" disabled={vSaving || !vReg.trim()} onClick={addVehicle}>
              {vSaving ? "Saving…" : "Save"}
            </button>
          </div>
          {vMsg && <p className="badge" style={{ marginTop: "0.4rem" }}>{vMsg}</p>}
        </details>
      </Shell>

      <h2 style={{ fontSize: "1rem", margin: "1.5rem 0 0.5rem" }}>Drivers</h2>
      <Shell loading={dLoad} error={dErr}>
        <table>
          <thead><tr>
            <th>Name</th><th>Licence no.</th><th>Licence expiry</th><th>CPC expiry</th><th>Status</th><th>Compliance</th><th></th>
          </tr></thead>
          <tbody>
            {(drivers ?? []).map(d => (
              <DriverRow key={d.id} company={company} d={d} onSaved={() => setRev(r => r + 1)} />
            ))}
            {(drivers ?? []).length === 0 && (
              <tr><td colSpan={7} className="state-msg">No drivers.</td></tr>
            )}
          </tbody>
        </table>

        <details style={{ marginTop: "0.75rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>+ Add driver</summary>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "flex-end" }}>
            <label style={{ fontSize: "0.8rem" }}>First name *<br />
              <input value={dFirst} onChange={e => setDFirst(e.target.value)} placeholder="First name" /></label>
            <label style={{ fontSize: "0.8rem" }}>Last name *<br />
              <input value={dLast} onChange={e => setDLast(e.target.value)} placeholder="Last name" /></label>
            <label style={{ fontSize: "0.8rem" }}>Licence no.<br />
              <input value={dLicence} onChange={e => setDLicence(e.target.value)} placeholder="Licence number" /></label>
            <label style={{ fontSize: "0.8rem" }}>Licence expiry<br />
              <input type="date" value={dLicExp} onChange={e => setDLicExp(e.target.value)} /></label>
            <label style={{ fontSize: "0.8rem" }}>CPC expiry<br />
              <input type="date" value={dCpc} onChange={e => setDCpc(e.target.value)} /></label>
            <button className="action-btn" disabled={dSaving || !dFirst.trim() || !dLast.trim()} onClick={addDriver}>
              {dSaving ? "Saving…" : "Save"}
            </button>
          </div>
          {dMsg && <p className="badge" style={{ marginTop: "0.4rem" }}>{dMsg}</p>}
        </details>
      </Shell>
    </>
  )
}

// ─── Loads ────────────────────────────────────────────────────────────────────

function LoadRow({ company, load, vehicles, drivers, onRefresh }: {
  company: string; load: Load; vehicles: Vehicle[]; drivers: Driver[]; onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [dnInput, setDnInput] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  async function assign() {
    const doc_nos = dnInput.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
    if (!doc_nos.length) { setMsg("Enter doc nos"); return }
    try {
      await api.loads.assign(company, load.load_id, { doc_nos })
      setDnInput(""); setMsg(`Assigned ${doc_nos.length} note(s)`); onRefresh()
    } catch (e) { setMsg(String(e)) }
  }

  async function confirm() {
    try { await api.loads.confirm(company, load.load_id); setMsg("Confirmed"); onRefresh() }
    catch (e) { setMsg(String(e)) }
  }

  async function depart() {
    if (!window.confirm(`Mark load ${load.load_reference} as departed?`)) return
    try { await api.loads.depart(company, load.load_id); setMsg("Departed"); onRefresh() }
    catch (e) { setMsg(String(e)) }
  }

  const vehicle = vehicles.find(v => v.id === load.vehicle_id)
  const driver = drivers.find(d => d.id === load.driver_id)

  return (
    <>
      <tr className="row-link" onClick={() => setExpanded(e => !e)}>
        <td><strong>{load.load_reference}</strong></td>
        <td>{vehicle ? vehicle.registration : (load.vehicle_id ? `#${load.vehicle_id}` : "—")}</td>
        <td>{driver ? `${driver.first_name} ${driver.last_name}` : (load.driver_id ? `#${load.driver_id}` : "—")}</td>
        <td>{fmtDate(load.planned_departure)}</td>
        <td><Badge value={load.status} /></td>
        <td style={{ display: "flex", gap: "0.25rem" }} onClick={e => e.stopPropagation()}>
          {load.status === "planning" && <button className="action-btn" onClick={confirm}>Confirm</button>}
          {load.status === "confirmed" && <button className="action-btn" onClick={depart}>Depart</button>}
          {msg && <span className="badge">{msg}</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding: "0.5rem 1rem", background: "var(--surface-alt, #f9f9f9)" }}>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem" }}>Assign delivery notes:</span>
              <input placeholder="DN001, DN002…" value={dnInput} onChange={e => setDnInput(e.target.value)} style={{ minWidth: "14rem" }} />
              <button className="action-btn" onClick={assign}>Assign</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function LoadList({ company }: { company: string }) {
  const [rev, setRev] = useState(0)
  const { data: loads, loading, error } = useData<Load[]>(() => api.loads.list(company), [company, rev])
  const { data: vehicles } = useData<Vehicle[]>(() => api.fleet.vehicles(company), [company])
  const { data: drivers } = useData<Driver[]>(() => api.fleet.drivers(company), [company])

  // New load form
  const [vId, setVId] = useState("")
  const [dId, setDId] = useState("")
  const [dep, setDep] = useState("")
  const [route, setRoute] = useState("")
  const [createMsg, setCreateMsg] = useState<string | null>(null)

  async function createLoad() {
    try {
      const r = await api.loads.create(company, {
        vehicle_id: vId ? Number(vId) : undefined,
        driver_id: dId ? Number(dId) : undefined,
        planned_departure: dep || undefined,
        route_description: route || undefined,
      })
      setVId(""); setDId(""); setDep(""); setRoute("")
      setCreateMsg(`Created ${r.load_reference}`); setRev(r => r + 1)
    } catch (e) { setCreateMsg(String(e)) }
  }

  const vList = vehicles ?? []
  const dList = drivers ?? []

  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Loads" />
      <table>
        <thead><tr><th>Reference</th><th>Vehicle</th><th>Driver</th><th>Departure</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {(loads ?? []).map(l => (
            <LoadRow key={l.load_id} company={company} load={l} vehicles={vList} drivers={dList} onRefresh={() => setRev(r => r + 1)} />
          ))}
          {(loads ?? []).length === 0 && <tr><td colSpan={6} className="state-msg">No loads.</td></tr>}
        </tbody>
      </table>

      <details style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>+ New load</summary>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", alignItems: "flex-end" }}>
          <label style={{ fontSize: "0.8rem" }}>Vehicle<br />
            <select value={vId} onChange={e => setVId(e.target.value)}>
              <option value="">— none —</option>
              {vList.map(v => <option key={v.id} value={v.id}>{v.registration}</option>)}
            </select>
          </label>
          <label style={{ fontSize: "0.8rem" }}>Driver<br />
            <select value={dId} onChange={e => setDId(e.target.value)}>
              <option value="">— none —</option>
              {dList.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: "0.8rem" }}>Departure<br />
            <input type="datetime-local" value={dep} onChange={e => setDep(e.target.value)} /></label>
          <label style={{ fontSize: "0.8rem" }}>Route<br />
            <input value={route} onChange={e => setRoute(e.target.value)} placeholder="e.g. Sheffield run" /></label>
          <button className="action-btn" onClick={createLoad}>Create load</button>
        </div>
        {createMsg && <p className="badge" style={{ marginTop: "0.4rem" }}>{createMsg}</p>}
      </details>
    </Shell>
  )
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export function SupplierList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [approvedOnly, setApprovedOnly] = useState(false)
  const [rev, setRev] = useState(0)
  const ds = useDebounce(search, 300)
  const { data: rows, loading, error } = useData<Supplier[]>(
    () => api.suppliers.list(company, ds, approvedOnly), [company, ds, approvedOnly, rev]
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Suppliers">
        <SearchBar value={search} onChange={setSearch} />
        <label style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <input type="checkbox" checked={approvedOnly} onChange={e => setApprovedOnly(e.target.checked)} />
          Approved only
        </label>
        <a className="action-btn" href={`#/${company}/suppliers/new`} style={{ textDecoration: "none" }}>+ New supplier</a>
      </Toolbar>
      <table>
        <thead><tr>
          <th>Code</th><th>Name</th><th>Type</th><th>Telephone</th><th>Email</th>
          <th>Approved</th><th>On hold</th><th>Delivery</th><th>Quality</th>
        </tr></thead>
        <tbody>
          {(rows ?? []).map(s => (
            <tr key={s.account_code}>
              <td><a href={`#/${company}/suppliers/${encodeURIComponent(s.account_code)}`}><code>{s.account_code}</code></a></td>
              <td>{s.name}</td>
              <td>{s.supplier_type || "—"}</td>
              <td>{s.telephone || "—"}</td>
              <td>{s.email || "—"}</td>
              <td>{s.approved_supplier ? <Badge value="Approved" /> : "—"}</td>
              <td>{s.on_hold ? <Badge value="On hold" /> : "—"}</td>
              <td>{s.delivery_rating != null ? `${s.delivery_rating}/5` : "—"}</td>
              <td>{s.quality_rating != null ? `${s.quality_rating}/5` : "—"}</td>
            </tr>
          ))}
          {!loading && (rows ?? []).length === 0 && (
            <tr><td colSpan={9} className="state-msg">No suppliers found.</td></tr>
          )}
        </tbody>
      </table>
      <button style={{ marginTop: "0.75rem", fontSize: "0.8rem" }} onClick={() => setRev(r => r + 1)}>Refresh</button>
    </Shell>
  )
}

function SupplierContactRow({ company, accountCode, seq, existing, onSaved }: {
  company: string; accountCode: string; seq: 1 | 2
  existing?: { name?: string | null; role?: string | null; email?: string | null; telephone?: string | null }
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [cf, setCf] = useState({ name: "", role: "", email: "", telephone: "" })
  const [msg, setMsg] = useState<string | null>(null)

  function startEdit() {
    setCf({ name: existing?.name || "", role: existing?.role || "", email: existing?.email || "", telephone: existing?.telephone || "" })
    setEditing(true)
  }

  return (
    <div style={{ marginBottom: "0.5rem", padding: "0.5rem", border: "1px solid var(--color-border,#ddd)", borderRadius: "4px" }}>
      <strong style={{ fontSize: "0.85rem" }}>Contact {seq}</strong>
      {!editing ? (
        <span style={{ marginLeft: "0.75rem", fontSize: "0.85rem" }}>
          {existing?.name || "—"}
          {existing?.role && ` (${existing.role})`}
          {existing?.email && ` · ${existing.email}`}
          {existing?.telephone && ` · ${existing.telephone}`}
          <button className="link-btn" style={{ marginLeft: "0.5rem" }} onClick={startEdit}>Edit</button>
        </span>
      ) : (
        <span style={{ display: "inline-flex", gap: "0.4rem", flexWrap: "wrap", marginLeft: "0.5rem" }}>
          <input placeholder="Name" value={cf.name} onChange={e => setCf(f => ({ ...f, name: e.target.value }))} style={{ width: "9em" }} />
          <input placeholder="Role" value={cf.role} onChange={e => setCf(f => ({ ...f, role: e.target.value }))} style={{ width: "7em" }} />
          <input placeholder="Email" value={cf.email} onChange={e => setCf(f => ({ ...f, email: e.target.value }))} style={{ width: "12em" }} />
          <input placeholder="Phone" value={cf.telephone} onChange={e => setCf(f => ({ ...f, telephone: e.target.value }))} style={{ width: "8em" }} />
          <button className="action-btn" onClick={async () => {
            try { await api.suppliers.updateContact(company, accountCode, seq, cf); setEditing(false); onSaved() }
            catch (e) { setMsg(String(e)) }
          }}>Save</button>
          <button onClick={() => setEditing(false)}>Cancel</button>
          {msg && <span style={{ fontSize: "0.8rem", color: "var(--fail,#c00)" }}>{msg}</span>}
        </span>
      )}
    </div>
  )
}

export function SupplierDetailView({ company, id }: { company: string; id: string }) {
  const [rev, setRev] = useState(0)
  const [editing, setEditing] = useState(false)
  const [patch, setPatch] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const { data: s, loading, error } = useData<SupplierDetail>(
    () => api.suppliers.get(company, id), [company, id, rev]
  )

  async function save() {
    if (!s) return
    setBusy(true); setMsg(null)
    try {
      await api.suppliers.update(company, id, patch)
      setEditing(false); setPatch({}); setRev(r => r + 1)
    } catch (e) { setMsg(String(e)) } finally { setBusy(false) }
  }

  function field(k: keyof SupplierDetail) {
    return editing
      ? <input value={String(patch[k] ?? s?.[k] ?? "")} onChange={e => setPatch(p => ({ ...p, [k]: e.target.value }))} />
      : <span>{String(s?.[k] ?? "—")}</span>
  }

  const perf = s?.performance?.[0]
  const { data: recentGrns } = useData<Awaited<ReturnType<typeof api.grn.list>>>(
    () => api.grn.list(company, id), [company, id]
  )

  return (
    <Shell loading={loading} error={error}>
      <a className="back-link" href={`#/${company}/suppliers`}>← Suppliers</a>
      {s && <>
        <Toolbar title={`${s.account_code} — ${s.name}`}>
          {!editing && <button onClick={() => setEditing(true)}>Edit</button>}
          {editing && <><button className="action-btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => { setEditing(false); setPatch({}) }}>Cancel</button></>}
        </Toolbar>
        {msg && <p className="gate-msg gate-msg--block">{msg}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.5rem" }}>Company details</h3>
            <table>
              <tbody>
                <tr><th>Name</th><td>{field("name")}</td></tr>
                <tr><th>Type</th><td>
                  {editing
                    ? <select value={String(patch["supplier_type"] ?? s.supplier_type ?? "")}
                        onChange={e => setPatch(p => ({ ...p, supplier_type: e.target.value }))}>
                        <option value="">—</option>
                        <option value="mill">Mill</option>
                        <option value="stockholder">Stockholder</option>
                        <option value="processor">Processor</option>
                        <option value="subcontractor">Subcontractor</option>
                        <option value="service">Service</option>
                      </select>
                    : <span>{s.supplier_type || "—"}</span>}
                </td></tr>
                <tr><th>Address</th><td>
                  {[s.address_line_1, s.address_line_2, s.address_line_3, s.address_line_4, s.postcode].filter(Boolean).join(", ") || "—"}
                </td></tr>
                <tr><th>Telephone</th><td>{field("telephone")}</td></tr>
                <tr><th>Email</th><td>{field("email")}</td></tr>
                <tr><th>Website</th><td>{s.website ? <a href={s.website} target="_blank" rel="noreferrer">{s.website}</a> : "—"}</td></tr>
                <tr><th>VAT No.</th><td>{s.vat_number || "—"}</td></tr>
                <tr><th>Currency</th><td>{s.currency || "GBP"}</td></tr>
                <tr><th>Accounting ref</th><td>{field("accounting_ref")}</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.5rem" }}>Approval & performance</h3>
            <table>
              <tbody>
                <tr><th>Approved</th><td>
                  {editing
                    ? <select value={String(patch["approved_supplier"] ?? s.approved_supplier ?? false)}
                        onChange={e => setPatch(p => ({ ...p, approved_supplier: e.target.value === "true" }))}>
                        <option value="false">No</option><option value="true">Yes</option>
                      </select>
                    : <Badge value={s.approved_supplier ? "Yes" : "No"} />}
                </td></tr>
                <tr><th>Approval ref</th><td>{field("approval_ref")}</td></tr>
                <tr><th>On hold</th><td>
                  {editing
                    ? <select value={String(patch["on_hold"] ?? s.on_hold ?? false)}
                        onChange={e => setPatch(p => ({ ...p, on_hold: e.target.value === "true" }))}>
                        <option value="false">No</option><option value="true">Yes</option>
                      </select>
                    : (s.on_hold ? <Badge value="On hold" /> : "—")}
                </td></tr>
                <tr><th>Hold reason</th><td>{field("hold_reason")}</td></tr>
                <tr><th>Lead time (days)</th><td>
                  {editing
                    ? <input type="number" min={0} style={{ width: "6em" }}
                        value={String(patch["lead_time_days"] ?? s.lead_time_days ?? "")}
                        onChange={e => setPatch(p => ({ ...p, lead_time_days: e.target.value ? parseInt(e.target.value) : null }))} />
                    : (s.lead_time_days ?? "—")}
                </td></tr>
                <tr><th>Delivery rating</th><td>
                  {editing
                    ? <select value={String(patch["delivery_rating"] ?? s.delivery_rating ?? "")}
                        onChange={e => setPatch(p => ({ ...p, delivery_rating: e.target.value ? parseInt(e.target.value) : null }))}>
                        <option value="">—</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    : (s.delivery_rating != null ? `${s.delivery_rating}/5` : "—")}
                </td></tr>
                <tr><th>Quality rating</th><td>
                  {editing
                    ? <select value={String(patch["quality_rating"] ?? s.quality_rating ?? "")}
                        onChange={e => setPatch(p => ({ ...p, quality_rating: e.target.value ? parseInt(e.target.value) : null }))}>
                        <option value="">—</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    : (s.quality_rating != null ? `${s.quality_rating}/5` : "—")}
                </td></tr>
                {perf && <>
                  <tr><th>Total orders</th><td>{perf.total_orders}</td></tr>
                  <tr><th>Overdue orders</th><td>{perf.overdue_orders > 0 ? <Badge value={String(perf.overdue_orders)} /> : "0"}</td></tr>
                  <tr><th>Avg lead (days)</th><td>{perf.avg_lead_days ?? "—"}</td></tr>
                  <tr><th>Total spend</th><td>{perf.total_spend_gbp != null ? fmtGbp(perf.total_spend_gbp) : "—"}</td></tr>
                </>}
              </tbody>
            </table>
          </div>
        </div>

        <h3 style={{ fontSize: "0.9rem", margin: "1.5rem 0 0.5rem" }}>Contacts</h3>
        {([1, 2] as const).map(seq => (
          <SupplierContactRow key={seq} company={company} accountCode={s.account_code}
            seq={seq} existing={s.contacts.find(c => c.seq === seq)}
            onSaved={() => setRev(r => r + 1)} />
        ))}

        {s.recent_orders.length > 0 && <>
          <h3 style={{ fontSize: "0.9rem", margin: "1.5rem 0 0.5rem" }}>Recent orders</h3>
          <table>
            <thead><tr><th>PO No.</th><th>Order date</th><th>Due</th><th>Status</th><th>Net £</th></tr></thead>
            <tbody>
              {s.recent_orders.map(o => (
                <tr key={o.order_no}>
                  <td><a href={`#/${company}/purchase-orders/${encodeURIComponent(o.order_no)}`}><code>{o.order_no}</code></a></td>
                  <td>{fmtDate(o.order_date_serial)}</td>
                  <td>{fmtDate(o.delivery_date_serial)}</td>
                  <td><Badge value={o.status || "—"} /></td>
                  <td>{o.net_gbp != null ? fmtGbp(o.net_gbp) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}

        {recentGrns && recentGrns.length > 0 && <>
          <h3 style={{ fontSize: "0.9rem", margin: "1.5rem 0 0.5rem" }}>Recent GRNs</h3>
          <table>
            <thead><tr><th>GRN</th><th>PO No.</th><th>Date</th><th>Stock code</th><th>Heat No.</th><th className="r">Qty</th></tr></thead>
            <tbody>
              {recentGrns.map(g => (
                <tr key={g.grn_no}>
                  <td><a href={`#/${company}/grn/${encodeURIComponent(g.grn_no)}`}><code>{g.grn_no}</code></a></td>
                  <td>{g.purchase_order_no
                    ? <a href={`#/${company}/purchase-orders/${encodeURIComponent(g.purchase_order_no)}`}><code>{g.purchase_order_no}</code></a>
                    : "—"}</td>
                  <td>{fmtDate(g.confirmed_at)}</td>
                  <td>{g.stock_account_code || "—"}</td>
                  <td>{g.heat_no || "—"}</td>
                  <td className="r">{g.quantity != null ? g.quantity : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>}
      </>}
    </Shell>
  )
}

export function SupplierNew({ company }: { company: string }) {
  const [form, setForm] = useState({
    account_code: "", name: "", address_line_1: "", postcode: "", telephone: "",
    email: "", supplier_type: "stockholder", approved_supplier: false, notes: "",
  })
  const [busy, setBusy] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function f(k: string) {
    return (e: { target: { value: string } }) =>
      setForm(p => ({ ...p, [k]: e.target.value }))
  }

  async function extract() {
    if (!fileRef.current?.files?.length) return
    setExtracting(true); setMsg(null)
    try {
      const data = await api.suppliers.extract(company, Array.from(fileRef.current.files))
      setForm(p => ({
        ...p,
        account_code: data["account_code"] || p.account_code,
        name: data["name"] || p.name,
        address_line_1: data["address_line_1"] || p.address_line_1,
        postcode: data["postcode"] || p.postcode,
        telephone: data["telephone"] || p.telephone,
        email: data["email"] || p.email,
        supplier_type: data["supplier_type"] || p.supplier_type,
        notes: data["notes"] || p.notes,
      }))
      setMsg("AI extracted — review and confirm.")
    } catch (e) { setMsg(String(e)) } finally { setExtracting(false) }
  }

  async function save() {
    if (!form.account_code.trim() || !form.name.trim()) { setMsg("Code and name are required."); return }
    setBusy(true); setMsg(null)
    try {
      const r = await api.suppliers.create(company, form)
      location.hash = `#/${company}/suppliers/${encodeURIComponent(r.account_code)}`
    } catch (e) { setMsg(String(e)); setBusy(false) }
  }

  return (
    <Shell loading={false} error={null}>
      <a className="back-link" href={`#/${company}/suppliers`}>← Suppliers</a>
      <Toolbar title="New Supplier" />

      <details style={{ marginBottom: "1rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>AI extract from PDF / document</summary>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
          <input ref={fileRef} type="file" accept=".pdf,image/*" multiple />
          <button onClick={extract} disabled={extracting}>{extracting ? "Extracting…" : "Extract"}</button>
        </div>
      </details>

      {msg && <p className={msg.startsWith("AI") ? "badge" : "gate-msg gate-msg--block"}>{msg}</p>}

      <table style={{ marginBottom: "1rem" }}>
        <tbody>
          <tr><th>Code *</th><td><input value={form.account_code} onChange={f("account_code")} placeholder="e.g. ACMESTL" /></td></tr>
          <tr><th>Name *</th><td><input style={{ width: "20em" }} value={form.name} onChange={f("name")} /></td></tr>
          <tr><th>Type</th><td>
            <select value={form.supplier_type} onChange={f("supplier_type")}>
              <option value="mill">Mill</option>
              <option value="stockholder">Stockholder</option>
              <option value="processor">Processor</option>
              <option value="subcontractor">Subcontractor</option>
              <option value="service">Service</option>
            </select>
          </td></tr>
          <tr><th>Address line 1</th><td><input style={{ width: "20em" }} value={form.address_line_1} onChange={f("address_line_1")} /></td></tr>
          <tr><th>Postcode</th><td><input value={form.postcode} onChange={f("postcode")} /></td></tr>
          <tr><th>Telephone</th><td><input value={form.telephone} onChange={f("telephone")} /></td></tr>
          <tr><th>Email</th><td><input value={form.email} onChange={f("email")} /></td></tr>
          <tr><th>Approved</th><td>
            <input type="checkbox" checked={form.approved_supplier}
              onChange={e => setForm(p => ({ ...p, approved_supplier: e.target.checked }))} />
          </td></tr>
          <tr><th>Notes</th><td><textarea value={form.notes} onChange={f("notes")} rows={3} style={{ width: "20em" }} /></td></tr>
        </tbody>
      </table>

      <button className="action-btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Create supplier"}</button>
    </Shell>
  )
}

export function SupplierPerformanceReport({ company }: { company: string }) {
  const { data: rows, loading, error } = useData<SupplierPerformance[]>(
    () => api.suppliers.performance(company), [company]
  )
  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Supplier Performance" />
      <table>
        <thead><tr>
          <th>Code</th><th>Name</th><th>Type</th><th>Approved</th><th>On hold</th>
          <th>Delivery</th><th>Quality</th><th>Orders</th><th>Overdue</th>
          <th>Avg lead (days)</th><th>Total spend</th>
        </tr></thead>
        <tbody>
          {(rows ?? []).map(r => (
            <tr key={r.account_code}>
              <td><a href={`#/${company}/suppliers/${encodeURIComponent(r.account_code)}`}><code>{r.account_code}</code></a></td>
              <td>{r.name}</td>
              <td>{r.supplier_type || "—"}</td>
              <td>{r.approved_supplier ? <Badge value="Yes" /> : "—"}</td>
              <td>{r.on_hold ? <Badge value="Hold" /> : "—"}</td>
              <td>{r.delivery_rating != null ? `${r.delivery_rating}/5` : "—"}</td>
              <td>{r.quality_rating != null ? `${r.quality_rating}/5` : "—"}</td>
              <td>{r.total_orders}</td>
              <td>{r.overdue_orders > 0 ? <Badge value={String(r.overdue_orders)} /> : "0"}</td>
              <td>{r.avg_lead_days ?? "—"}</td>
              <td>{r.total_spend_gbp != null ? fmtGbp(r.total_spend_gbp) : "—"}</td>
            </tr>
          ))}
          {!loading && (rows ?? []).length === 0 && (
            <tr><td colSpan={11} className="state-msg">No data.</td></tr>
          )}
        </tbody>
      </table>
    </Shell>
  )
}

// ─── Terms & Conditions ───────────────────────────────────────────────────────

export function TermsView({ company }: { company: string }) {
  const [rev, setRev] = useState(0)
  const [tab, setTab] = useState<"sale" | "purchase">("sale")
  const [detail, setDetail] = useState<TermsDocumentDetail | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ version: "", title: "", content_text: "", effective_date: "" })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Acceptance form (in detail view)
  const [accForm, setAccForm] = useState({ customer_account: "", accepted_by: "", method: "portal", notes: "" })

  const { data: docs, loading, error } = useData<TermsDocument[]>(
    () => api.terms.list(company, undefined, false), [company, rev]
  )
  const sale = (docs ?? []).filter(d => d.terms_type === "sale")
  const purchase = (docs ?? []).filter(d => d.terms_type === "purchase")
  const shown = tab === "sale" ? sale : purchase

  async function loadDetail(id: number) {
    try { setDetail(await api.terms.get(company, id)) } catch (e) { setMsg(String(e)) }
  }

  async function create() {
    if (!form.version.trim()) { setMsg("Version is required."); return }
    setBusy(true); setMsg(null)
    try {
      await api.terms.create(company, { terms_type: tab, ...form })
      setCreating(false); setForm({ version: "", title: "", content_text: "", effective_date: "" })
      setRev(r => r + 1)
    } catch (e) { setMsg(String(e)) } finally { setBusy(false) }
  }

  async function recordAcceptance() {
    if (!detail || !accForm.customer_account.trim()) { setMsg("Customer account required."); return }
    setBusy(true); setMsg(null)
    try {
      await api.terms.recordAcceptance(company, {
        customer_account: accForm.customer_account.trim().toUpperCase(),
        terms_id: detail.id,
        accepted_by: accForm.accepted_by || undefined,
        method: accForm.method || "portal",
        notes: accForm.notes || undefined,
      })
      setAccForm({ customer_account: "", accepted_by: "", method: "portal", notes: "" })
      await loadDetail(detail.id)
    } catch (e) { setMsg(String(e)) } finally { setBusy(false) }
  }

  if (detail) return (
    <Shell loading={false} error={null}>
      <button className="back-link" onClick={() => setDetail(null)}>← Terms list</button>
      <Toolbar title={`${detail.terms_type === "sale" ? "Sale" : "Purchase"} T&Cs — v${detail.version}`} />
      {msg && <p className="gate-msg gate-msg--block">{msg}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.5rem" }}>{detail.title || "Untitled"}</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--color-muted, #666)" }}>
            Effective: {fmtDate(detail.effective_date)} · Version {detail.version}
            {detail.superseded_at ? ` · Superseded ${fmtDate(detail.superseded_at)}` : " · Active"}
          </p>
          {detail.content_text && (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", lineHeight: 1.5, maxHeight: "24rem", overflow: "auto",
              border: "1px solid var(--color-border, #ddd)", padding: "0.75rem", borderRadius: "4px" }}>
              {detail.content_text}
            </pre>
          )}
        </div>
        <div>
          <h3 style={{ fontSize: "0.9rem", margin: "0 0 0.5rem" }}>Customer acceptances ({detail.acceptances.length})</h3>
          {detail.terms_type === "sale" && (
            <div style={{ marginBottom: "0.75rem", padding: "0.75rem", border: "1px solid var(--color-border, #ddd)", borderRadius: "4px" }}>
              <strong style={{ fontSize: "0.85rem" }}>Record acceptance</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.4rem" }}>
                <label style={{ fontSize: "0.8rem" }}>Customer account
                  <CustomerPicker company={company} value={accForm.customer_account}
                    onChange={v => setAccForm(f => ({ ...f, customer_account: v }))} /></label>
                <label style={{ fontSize: "0.8rem" }}>Accepted by
                  <input value={accForm.accepted_by} onChange={e => setAccForm(f => ({ ...f, accepted_by: e.target.value }))} /></label>
                <label style={{ fontSize: "0.8rem" }}>Method
                  <select value={accForm.method} onChange={e => setAccForm(f => ({ ...f, method: e.target.value }))}>
                    <option value="portal">Portal</option>
                    <option value="email">Email</option>
                    <option value="signed">Signed document</option>
                    <option value="verbal">Verbal</option>
                  </select></label>
                <label style={{ fontSize: "0.8rem" }}>Notes
                  <input value={accForm.notes} onChange={e => setAccForm(f => ({ ...f, notes: e.target.value }))} /></label>
              </div>
              <button className="action-btn" style={{ marginTop: "0.4rem" }} disabled={busy} onClick={recordAcceptance}>
                Record
              </button>
            </div>
          )}
          <table>
            <thead><tr><th>Customer</th><th>Accepted at</th><th>By</th><th>Method</th></tr></thead>
            <tbody>
              {detail.acceptances.map(a => (
                <tr key={a.id}>
                  <td><code>{a.customer_account}</code></td>
                  <td>{fmtDate(a.accepted_at?.slice(0, 10))}</td>
                  <td>{a.accepted_by || "—"}</td>
                  <td>{a.method || "—"}</td>
                </tr>
              ))}
              {detail.acceptances.length === 0 && <tr><td colSpan={4} className="state-msg">No acceptances recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  )

  return (
    <Shell loading={loading} error={error}>
      <Toolbar title="Terms & Conditions">
        <button className={tab === "sale" ? "action-btn" : ""} onClick={() => setTab("sale")}>Sale T&Cs</button>
        <button className={tab === "purchase" ? "action-btn" : ""} onClick={() => setTab("purchase")}>Purchase T&Cs</button>
        <button onClick={() => setCreating(o => !o)}>+ New version</button>
      </Toolbar>

      {msg && <p className="gate-msg gate-msg--block">{msg}</p>}

      {creating && (
        <div style={{ padding: "0.75rem", border: "1px solid var(--color-border, #ddd)", borderRadius: "4px", marginBottom: "1rem" }}>
          <strong style={{ fontSize: "0.85rem" }}>New {tab === "sale" ? "Sale" : "Purchase"} T&Cs</strong>
          <p style={{ fontSize: "0.8rem", color: "var(--color-muted, #666)", margin: "0.25rem 0 0.5rem" }}>
            Creating a new version will supersede the current active document.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.8rem" }}>Version *
              <input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="e.g. 2024-01" /></label>
            <label style={{ fontSize: "0.8rem" }}>Title
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></label>
            <label style={{ fontSize: "0.8rem" }}>Effective date
              <input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} /></label>
          </div>
          <label style={{ fontSize: "0.8rem", display: "block", marginTop: "0.4rem" }}>Terms text
            <textarea rows={6} style={{ width: "100%", marginTop: "0.25rem" }}
              value={form.content_text} onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))} /></label>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
            <button className="action-btn" disabled={busy} onClick={create}>{busy ? "Saving…" : "Create"}</button>
            <button onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <table>
        <thead><tr><th>Version</th><th>Title</th><th>Effective</th><th>Status</th><th>Acceptances</th></tr></thead>
        <tbody>
          {shown.map(d => (
            <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => loadDetail(d.id)}>
              <td><strong>{d.version}</strong></td>
              <td>{d.title || "—"}</td>
              <td>{fmtDate(d.effective_date)}</td>
              <td><Badge value={d.superseded_at ? "superseded" : "active"} /></td>
              <td><button onClick={e => { e.stopPropagation(); loadDetail(d.id) }}>View →</button></td>
            </tr>
          ))}
          {!loading && shown.length === 0 && <tr><td colSpan={5} className="state-msg">No {tab} T&Cs yet.</td></tr>}
        </tbody>
      </table>
    </Shell>
  )
}

// ─── A4: FX Forward Contracts ─────────────────────────────────────────────────

export function FxView({ company }: { company: string }) {
  const [tab, setTab] = useState<"open" | "settled" | "cancelled">("open")
  const [showNew, setShowNew] = useState(false)
  const [showRate, setShowRate] = useState(false)
  const [settling, setSettling] = useState<ForwardContract | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  const { data: contracts, loading, error } = useData(
    () => api.fx.listForwards(company, tab), [company, tab, reloadKey]
  )
  const { data: rates } = useData(() => api.fx.listRates(company, undefined, 7), [company, reloadKey])

  const [form, setForm] = useState({
    currency_pair: "EUR/GBP", direction: "buy",
    foreign_amount: "", contract_rate: "", settlement_date: "",
    bank_reference: "", linked_po_no: "", notes: "",
  })
  const [settleForm, setSettleForm] = useState({ realized_rate: "", notes: "" })
  const [rateForm, setRateForm] = useState({ quote_ccy: "EUR", spot_rate: "", rate_date: "" })

  const create = async () => {
    if (!form.foreign_amount || !form.contract_rate || !form.settlement_date) {
      setMsg("Amount, rate and settlement date required"); return
    }
    setBusy(true); setMsg("")
    try {
      await api.fx.createForward(company, {
        currency_pair: form.currency_pair, direction: form.direction,
        foreign_amount: parseFloat(form.foreign_amount),
        contract_rate: parseFloat(form.contract_rate),
        settlement_date: form.settlement_date,
        bank_reference: form.bank_reference || undefined,
        linked_po_no: form.linked_po_no || undefined,
        notes: form.notes || undefined,
      })
      setShowNew(false); reload()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error") }
    finally { setBusy(false) }
  }

  const settle = async () => {
    if (!settling || !settleForm.realized_rate) { setMsg("Enter realized rate"); return }
    setBusy(true); setMsg("")
    try {
      await api.fx.settle(company, settling.contract_no, {
        realized_rate: parseFloat(settleForm.realized_rate),
        notes: settleForm.notes || undefined,
      })
      setSettling(null); reload()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error") }
    finally { setBusy(false) }
  }

  const cancelFwd = async (no: string) => {
    if (!confirm(`Cancel ${no}?`)) return
    setBusy(true)
    try { await api.fx.cancel(company, no); reload() }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error") }
    finally { setBusy(false) }
  }

  const upsertRate = async () => {
    if (!rateForm.spot_rate || !rateForm.rate_date) { setMsg("Date and rate required"); return }
    setBusy(true)
    try {
      await api.fx.upsertRate(company, {
        quote_ccy: rateForm.quote_ccy.toUpperCase(),
        spot_rate: parseFloat(rateForm.spot_rate),
        rate_date: rateForm.rate_date,
      })
      setShowRate(false); reload()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error") }
    finally { setBusy(false) }
  }

  const mtmColor = (v: number | null) =>
    v == null ? "" : v >= 0 ? "var(--green)" : "var(--red)"

  const totalMtm = contracts?.filter(c => c.mtm_gain_loss_gbp != null)
    .reduce((s, c) => s + (c.mtm_gain_loss_gbp ?? 0), 0) ?? null

  return (
    <Shell loading={loading} error={error}>
      <div className="page-header">
        <h2>FX Forward Contracts</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => { setShowRate(r => !r); setShowNew(false) }}>
            {showRate ? "Cancel" : "Record Spot Rate"}
          </button>
          <button className="action-btn" onClick={() => { setShowNew(n => !n); setShowRate(false) }}>
            {showNew ? "Cancel" : "+ New Contract"}
          </button>
        </div>
      </div>

      {msg && <p className="banner banner-warn">{msg}</p>}

      {showRate && (
        <div className="form-box" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem" }}>
            <label>Date <input type="date" value={rateForm.rate_date}
              onChange={e => setRateForm(f => ({ ...f, rate_date: e.target.value }))} /></label>
            <label>Currency <input value={rateForm.quote_ccy} placeholder="EUR"
              onChange={e => setRateForm(f => ({ ...f, quote_ccy: e.target.value }))} /></label>
            <label>Spot (1 GBP = x CCY) <input type="number" step="0.0001" value={rateForm.spot_rate}
              onChange={e => setRateForm(f => ({ ...f, spot_rate: e.target.value }))} /></label>
          </div>
          <button className="action-btn" disabled={busy} onClick={upsertRate} style={{ marginTop: "0.5rem" }}>
            Save Rate
          </button>
        </div>
      )}

      {showNew && (
        <div className="form-box" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem" }}>
            <label>Pair <input value={form.currency_pair} placeholder="EUR/GBP"
              onChange={e => setForm(f => ({ ...f, currency_pair: e.target.value }))} /></label>
            <label>Direction
              <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
                <option value="buy">Buy foreign</option>
                <option value="sell">Sell foreign</option>
              </select>
            </label>
            <label>Foreign amount <input type="number" step="0.01" value={form.foreign_amount}
              onChange={e => setForm(f => ({ ...f, foreign_amount: e.target.value }))} /></label>
            <label>Contract rate (1 GBP = x) <input type="number" step="0.0001" value={form.contract_rate}
              onChange={e => setForm(f => ({ ...f, contract_rate: e.target.value }))} /></label>
            <label>Settlement date <input type="date" value={form.settlement_date}
              onChange={e => setForm(f => ({ ...f, settlement_date: e.target.value }))} /></label>
            <label>Bank ref <input value={form.bank_reference}
              onChange={e => setForm(f => ({ ...f, bank_reference: e.target.value }))} /></label>
            <label>Linked PO <input value={form.linked_po_no}
              onChange={e => setForm(f => ({ ...f, linked_po_no: e.target.value }))} /></label>
            <label>Notes <input value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></label>
          </div>
          <button className="action-btn" disabled={busy} onClick={create} style={{ marginTop: "0.5rem" }}>
            {busy ? "Saving…" : "Create Contract"}
          </button>
        </div>
      )}

      {settling && (
        <div className="form-box" style={{ marginBottom: "1rem", borderColor: "var(--amber)" }}>
          <strong>Settle {settling.contract_no}</strong> — contracted rate {settling.contract_rate}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.5rem" }}>
            <label>Realized rate (1 GBP = x) <input type="number" step="0.0001"
              value={settleForm.realized_rate}
              onChange={e => setSettleForm(f => ({ ...f, realized_rate: e.target.value }))} /></label>
            <label>Notes <input value={settleForm.notes}
              onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))} /></label>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
            <button className="action-btn" disabled={busy} onClick={settle}>Confirm Settlement</button>
            <button onClick={() => setSettling(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center" }}>
        {(["open","settled","cancelled"] as const).map(t => (
          <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {tab === "open" && totalMtm != null && (
          <span style={{ marginLeft: "auto", color: mtmColor(totalMtm), fontWeight: 600 }}>
            MTM: {totalMtm >= 0 ? "+" : ""}£{totalMtm.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>Contract</th><th>Pair</th><th>Dir</th>
            <th className="num">Foreign Amt</th><th className="num">Rate</th>
            <th className="num">GBP Equiv</th><th>Settlement</th><th>PO Link</th>
            {tab === "open"     && <><th className="num">Spot</th><th className="num">MTM P&amp;L</th></>}
            {tab === "settled"  && <><th className="num">Realized Rate</th><th className="num">Gain/Loss</th></>}
            <th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {!contracts?.length && (
            <tr><td colSpan={12} className="state-msg">No {tab} contracts</td></tr>
          )}
          {contracts?.map(c => {
            const ccy = c.currency_pair.split("/")[0] ?? ""
            return (
              <tr key={c.id}>
                <td><strong>{c.contract_no}</strong></td>
                <td>{c.currency_pair}</td>
                <td><Badge value={c.direction} /></td>
                <td className="num">{Number(c.foreign_amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })} {ccy}</td>
                <td className="num">{Number(c.contract_rate).toFixed(4)}</td>
                <td className="num">£{Number(c.gbp_equivalent).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                <td>{fmtDate(c.settlement_date)}</td>
                <td>{c.linked_po_no ?? "—"}</td>
                {tab === "open" && <>
                  <td className="num">{c.latest_spot_rate ? Number(c.latest_spot_rate).toFixed(4) : "—"}</td>
                  <td className="num" style={{ color: mtmColor(c.mtm_gain_loss_gbp) }}>
                    {c.mtm_gain_loss_gbp != null
                      ? `${c.mtm_gain_loss_gbp >= 0 ? "+" : ""}£${Number(c.mtm_gain_loss_gbp).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                </>}
                {tab === "settled" && <>
                  <td className="num">{c.realized_rate ? Number(c.realized_rate).toFixed(4) : "—"}</td>
                  <td className="num" style={{ color: mtmColor(c.realized_gain_loss_gbp) }}>
                    {c.realized_gain_loss_gbp != null
                      ? `${c.realized_gain_loss_gbp >= 0 ? "+" : ""}£${Number(c.realized_gain_loss_gbp).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                </>}
                <td><Badge value={c.status} /></td>
                <td>
                  {c.status === "open" && (
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <button onClick={() => { setSettling(c); setSettleForm({ realized_rate: "", notes: "" }) }}>Settle</button>
                      <button onClick={() => cancelFwd(c.contract_no)}>Cancel</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {rates && rates.length > 0 && (
        <details style={{ marginTop: "1.5rem" }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Recent spot rates (7 days)</summary>
          <table style={{ marginTop: "0.5rem" }}>
            <thead><tr><th>Date</th><th>Pair</th><th>Spot</th><th>Source</th></tr></thead>
            <tbody>
              {(rates as CurrencyRate[]).map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.rate_date)}</td>
                  <td>{r.base_ccy}/{r.quote_ccy}</td>
                  <td className="num">{Number(r.spot_rate).toFixed(4)}</td>
                  <td>{r.source ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Shell>
  )
}

// ── Branding ──────────────────────────────────────────────────────────────────

const BRANDING_PROFILE_FIELDS: { key: string; label: string; wide?: boolean; area?: boolean; num?: boolean }[] = [
  { key: "legal_name",   label: "Registered company name", wide: true },
  { key: "trading_name", label: "Trading name" },
  { key: "address_line1", label: "Address line 1" },
  { key: "address_line2", label: "Address line 2" },
  { key: "address_line3", label: "Address line 3" },
  { key: "city",          label: "Town / city" },
  { key: "postcode",      label: "Postcode" },
  { key: "country",       label: "Country" },
  { key: "phone",         label: "Phone" },
  { key: "email",         label: "Email" },
  { key: "website",       label: "Website" },
  { key: "reg_number",    label: "Company reg. number" },
  { key: "vat_number",    label: "VAT number" },
  { key: "despatch_tolerance_pct", label: "Despatch tolerance %", num: true },
]

export function BrandingView({ company }: { company: string }) {
  // ── Company profile settings ────────────────────────────────────────────────
  const [settings, setSettings] = useState<Setting[]>([])
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

  const loadSettings = useCallback(() => {
    setSettingsLoading(true)
    api.admin.settings(company)
      .then(setSettings)
      .catch(e => setSettingsMsg(String(e)))
      .finally(() => setSettingsLoading(false))
  }, [company])
  useEffect(() => { loadSettings() }, [loadSettings])

  const initial = () => Object.fromEntries(BRANDING_PROFILE_FIELDS.map(f =>
    [f.key, settings.find(s => s.key === "company." + f.key)?.value ?? ""]))
  const [profileVals, setProfileVals] = useState<Record<string, string>>(initial)
  useEffect(() => setProfileVals(initial()), [settings])  // refill when settings load

  const profileDirty = BRANDING_PROFILE_FIELDS.some(f =>
    profileVals[f.key] !== (settings.find(s => s.key === "company." + f.key)?.value ?? ""))

  async function saveProfile() {
    setProfileSaving(true); setSettingsMsg(null)
    try {
      for (const f of BRANDING_PROFILE_FIELDS) {
        const was = settings.find(s => s.key === "company." + f.key)?.value ?? ""
        if (profileVals[f.key] !== was)
          await api.admin.putSetting(company, "company." + f.key, profileVals[f.key])
      }
      setSettingsMsg("Profile saved")
      loadSettings()
    } catch (e) { setSettingsMsg(String(e)) }
    finally { setProfileSaving(false) }
  }

  // ── Accreditation logos ─────────────────────────────────────────────────────
  const [logoRev, setLogoRev] = useState(0)
  const [logos, setLogos] = useState<AccreditationLogo[]>([])
  const [logosLoading, setLogosLoading] = useState(true)
  const [logosMsg, setLogosMsg] = useState<string | null>(null)
  const [uploadName, setUploadName] = useState("")
  const [uploadBusy, setUploadBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLogosLoading(true)
    api.company.logos(company)
      .then(setLogos)
      .catch(e => setLogosMsg(String(e)))
      .finally(() => setLogosLoading(false))
  }, [company, logoRev])

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !uploadName.trim()) return
    setUploadBusy(true); setLogosMsg(null)
    try {
      await api.company.uploadLogo(company, file, uploadName.trim())
      setUploadName("")
      if (fileRef.current) fileRef.current.value = ""
      setLogoRev(r => r + 1)
    } catch (e) { setLogosMsg(String(e)) }
    finally { setUploadBusy(false) }
  }

  async function moveLogo(logo: AccreditationLogo, dir: -1 | 1) {
    const sorted = [...logos].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(l => l.id === logo.id)
    const swap = sorted[idx + dir]
    if (!swap) return
    setLogosMsg(null)
    try {
      await Promise.all([
        api.company.updateLogo(company, logo.id, { sort_order: swap.sort_order }),
        api.company.updateLogo(company, swap.id, { sort_order: logo.sort_order }),
      ])
      setLogoRev(r => r + 1)
    } catch (e) { setLogosMsg(String(e)) }
  }

  async function toggleActive(logo: AccreditationLogo) {
    setLogosMsg(null)
    try {
      await api.company.updateLogo(company, logo.id, { is_active: !logo.is_active })
      setLogoRev(r => r + 1)
    } catch (e) { setLogosMsg(String(e)) }
  }

  async function deleteLogo(logo: AccreditationLogo) {
    if (!confirm(`Delete logo "${logo.display_name}"?`)) return
    setLogosMsg(null)
    try {
      await api.company.deleteLogo(company, logo.id)
      setLogoRev(r => r + 1)
    } catch (e) { setLogosMsg(String(e)) }
  }

  const sortedLogos = [...logos].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <Shell loading={settingsLoading} error={null}>
      <Toolbar title="Branding" />

      {/* ── Company Profile ── */}
      <div className="detail-lines" style={{ marginBottom: "2rem" }}>
        <h3>Company profile</h3>
        <p style={{ fontSize: ".82rem", color: "var(--text-muted)", marginBottom: ".75rem" }}>
          Printed on all external documents for {company}.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1rem" }}>
          {BRANDING_PROFILE_FIELDS.map(f => (
            <label key={f.key} style={f.wide ? { gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.85rem" } : { display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.85rem" }}>
              {f.label}
              {f.area
                ? <textarea rows={2} value={profileVals[f.key] ?? ""} onChange={e => setProfileVals(v => ({ ...v, [f.key]: e.target.value }))} />
                : <input type={f.num ? "number" : "text"} min={f.num ? 0 : undefined} max={f.num ? 100 : undefined}
                    value={profileVals[f.key] ?? ""} onChange={e => setProfileVals(v => ({ ...v, [f.key]: e.target.value }))} />}
            </label>
          ))}
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <button className="action-btn" disabled={!profileDirty || profileSaving} onClick={saveProfile}>
            {profileSaving ? "Saving…" : "Save profile"}
          </button>
          {settingsMsg && <span style={{ marginLeft: "0.75rem", fontSize: "0.85rem" }}>{settingsMsg}</span>}
        </div>
      </div>

      {/* ── Accreditation Logos ── */}
      <div className="detail-lines">
        <h3>Accreditation logos</h3>
        <p style={{ fontSize: ".82rem", color: "var(--text-muted)", marginBottom: ".75rem" }}>
          SVG or PNG logos printed on external documents (delivery notes, cert packs).
        </p>

        {logosMsg && <p className="badge" style={{ marginBottom: "0.5rem" }}>{logosMsg}</p>}

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            Display name
            <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. ISO 9001" style={{ width: "14rem" }} />
          </label>
          <label style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            File (SVG or PNG)
            <input ref={fileRef} type="file" accept=".svg,.png" />
          </label>
          <button className="action-btn" disabled={uploadBusy || !uploadName.trim()} onClick={upload}>
            {uploadBusy ? "Uploading…" : "Upload logo"}
          </button>
        </div>

        {logosLoading ? (
          <p className="state-msg">Loading…</p>
        ) : sortedLogos.length === 0 ? (
          <p className="state-msg">No logos uploaded.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Display name</th><th>Active</th><th>Order</th><th></th></tr>
            </thead>
            <tbody>
              {sortedLogos.map((logo, idx) => (
                <tr key={logo.id}>
                  <td>{logo.display_name}</td>
                  <td>
                    <button onClick={() => toggleActive(logo)}>
                      {logo.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td style={{ display: "flex", gap: "0.25rem" }}>
                    <button disabled={idx === 0} onClick={() => moveLogo(logo, -1)}>↑</button>
                    <button disabled={idx === sortedLogos.length - 1} onClick={() => moveLogo(logo, 1)}>↓</button>
                  </td>
                  <td>
                    <button onClick={() => deleteLogo(logo)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Shell>
  )
}

// ─── Accounting Export ─────────────────────────────────────────────────────────

export function AccountingView({ company }: { company: string }) {
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  const [pkg, setPkg] = useState("xero")
  const [busy, setBusy] = useState(false)

  const { data: summary } = useData<UnpostedSummary>(
    () => api.accounting.unpostedSummary(company), [company, reloadKey]
  )
  const { data: runs, loading, error } = useData<PostingRun[]>(
    () => api.accounting.listRuns(company), [company, reloadKey]
  )

  const createRun = async () => {
    setBusy(true)
    try {
      await api.accounting.createRun(company, { package: pkg, ledger: "sales" })
      reload()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Error") }
    finally { setBusy(false) }
  }

  const confirmRun = async (run: PostingRun) => {
    if (!confirm(`Confirm run #${run.id}? This will mark all transactions as posted.`)) return
    try {
      await api.accounting.confirm(company, run.id)
      reload()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Error") }
  }

  const voidRun = async (run: PostingRun) => {
    if (!confirm(`Void run #${run.id}? Transactions will return to unposted.`)) return
    try {
      await api.accounting.voidRun(company, run.id)
      reload()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Error") }
  }

  const allPosted = summary && summary.invoices.count === 0 && summary.credit_notes.count === 0

  return (
    <Shell loading={loading} error={error}>
      <div className="page-header">
        <h2>Accounting Export</h2>
      </div>

      {/* Unposted summary */}
      <div className="form-box" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Unposted transactions</h3>
        {allPosted ? (
          <p>All transactions posted</p>
        ) : (
          <>
            {summary && summary.invoices.count > 0 && (
              <p>{summary.invoices.count} invoice{summary.invoices.count !== 1 ? "s" : ""}, £{summary.invoices.net_gbp.toFixed(2)} net</p>
            )}
            {summary && summary.credit_notes.count > 0 && (
              <p>{summary.credit_notes.count} credit note{summary.credit_notes.count !== 1 ? "s" : ""}, £{summary.credit_notes.net_gbp.toFixed(2)} net</p>
            )}
          </>
        )}
      </div>

      {/* Create posting run */}
      <div className="form-box" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Create posting run</h3>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            Package
            <select value={pkg} onChange={e => setPkg(e.target.value)}>
              <option value="xero">Xero</option>
              <option value="sage50">Sage 50</option>
              <option value="sage200">Sage 200</option>
              <option value="qbo">QuickBooks Online</option>
            </select>
          </label>
          <label style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            Ledger
            <span style={{ padding: "0.3rem 0" }}>Sales <span style={{ color: "var(--text-muted)", fontSize: "0.8em" }}>(purchase ledger coming soon)</span></span>
          </label>
          <button className="action-btn" disabled={busy} onClick={createRun}>
            {busy ? "Creating…" : "Create run"}
          </button>
        </div>
      </div>

      {/* Runs table */}
      {runs && runs.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Package</th>
              <th>Ledger</th>
              <th>Status</th>
              <th>Transactions</th>
              <th>Net (£)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(run => (
              <tr key={run.id}>
                <td>{run.id}</td>
                <td>{run.run_date}</td>
                <td>{run.package}</td>
                <td>{run.ledger}</td>
                <td>{run.status}</td>
                <td>{run.tx_count}</td>
                <td>{(run.net_total / 100).toFixed(2)}</td>
                <td style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {(run.status === "draft" || run.status === "generated" || run.status === "confirmed") && (
                    <a href={api.accounting.csvUrl(company, run.id)}
                      download={`${company}-${run.package}-${run.id}.csv`}
                      className="action-btn"
                      style={{ textDecoration: "none", display: "inline-block" }}>
                      Download CSV
                    </a>
                  )}
                  {(run.status === "draft" || run.status === "generated") && (
                    <>
                      <button onClick={() => confirmRun(run)}>Confirm</button>
                      <button onClick={() => voidRun(run)}>Void</button>
                    </>
                  )}
                  {run.status === "voided" && <span style={{ color: "var(--text-muted)" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {runs && runs.length === 0 && <p className="state-msg">No posting runs yet.</p>}
    </Shell>
  )
}

// ── Stock Adjustments ─────────────────────────────────────────────────────────

const ADJUSTMENT_TYPES = ["quantity", "weight", "location", "grade", "quarantine", "write_off"]
const REASON_CODES = [
  "counting_error", "unrecorded_consumption", "unrecorded_receipt",
  "damage_write_off", "theft_loss", "system_error",
  "weight_reweigh", "location_move", "grade_correction",
  "quarantine_hold", "quarantine_release", "write_off",
]

export function StockAdjustmentsView({ company }: { company: string }) {
  const [adjustments, setAdjustments] = useState<StockAdjustment[] | null>(null)
  const [filterBatch, setFilterBatch] = useState("")
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [batchId, setBatchId] = useState("")
  const [adjType, setAdjType] = useState("quantity")
  const [reasonCode, setReasonCode] = useState("counting_error")
  const [reasonNotes, setReasonNotes] = useState("")
  const [oldValuesJson, setOldValuesJson] = useState("{}")
  const [newValuesJson, setNewValuesJson] = useState("{}")
  const [formErr, setFormErr] = useState<string | null>(null)

  const load = useCallback(async (batch?: string) => {
    setLoading(true)
    setLoadErr(null)
    try {
      const data = await api.stockAdjustments.list(company, batch || undefined)
      setAdjustments(data)
    } catch (e) {
      setLoadErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [company])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null)
    let oldV: Record<string, unknown>, newV: Record<string, unknown>
    try { oldV = JSON.parse(oldValuesJson) } catch { setFormErr("Old values: invalid JSON"); return }
    try { newV = JSON.parse(newValuesJson) } catch { setFormErr("New values: invalid JSON"); return }
    setSubmitting(true)
    try {
      await api.stockAdjustments.create(company, {
        batch_id: batchId,
        adjustment_type: adjType,
        old_values: oldV,
        new_values: newV,
        reason_code: reasonCode,
        reason_notes: reasonNotes || undefined,
      })
      setBatchId(""); setReasonNotes(""); setOldValuesJson("{}"); setNewValuesJson("{}")
      await load(filterBatch)
    } catch (e) {
      setFormErr(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReverse(adj: StockAdjustment) {
    if (!confirm(`Reverse adjustment #${adj.id}?`)) return
    try {
      await api.stockAdjustments.reverse(company, adj.id)
      await load(filterBatch)
    } catch (e) {
      alert(String(e))
    }
  }

  return (
    <Shell loading={loading} error={loadErr}>
      <div className="page-header">
        <h2>Stock Adjustments</h2>
      </div>

      {/* New Adjustment form */}
      <div className="form-box" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>New Adjustment</h3>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
          <label>
            Batch ID / Batch No
            <input value={batchId} onChange={e => setBatchId(e.target.value)} required placeholder="e.g. B-00042" />
          </label>
          <label>
            Adjustment Type
            <select value={adjType} onChange={e => setAdjType(e.target.value)}>
              {ADJUSTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Reason Code
            <select value={reasonCode} onChange={e => setReasonCode(e.target.value)}>
              {REASON_CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Reason Notes
            <textarea value={reasonNotes} onChange={e => setReasonNotes(e.target.value)} rows={2} />
          </label>
          <label>
            Old Values (JSON)
            <textarea value={oldValuesJson} onChange={e => setOldValuesJson(e.target.value)} rows={3} style={{ fontFamily: "monospace" }} />
          </label>
          <label>
            New Values (JSON)
            <textarea value={newValuesJson} onChange={e => setNewValuesJson(e.target.value)} rows={3} style={{ fontFamily: "monospace" }} />
          </label>
          {formErr && <p className="err-msg">{formErr}</p>}
          <div><button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Create Adjustment"}</button></div>
        </form>
      </div>

      {/* Filter + list */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <input
          placeholder="Filter by batch ID…"
          value={filterBatch}
          onChange={e => setFilterBatch(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <button onClick={() => load(filterBatch)}>Filter</button>
        {filterBatch && <button onClick={() => { setFilterBatch(""); load() }}>Clear</button>}
      </div>

      {adjustments !== null && adjustments.length === 0 && <p className="state-msg">No adjustments found.</p>}
      {adjustments !== null && adjustments.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Batch</th>
              <th>Type</th>
              <th>Reason</th>
              <th>Notes</th>
              <th>By</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map(adj => (
              <tr key={adj.id} style={adj.reversal_of_adjustment_id !== null ? { opacity: 0.6 } : undefined}>
                <td>{adj.id}</td>
                <td>{adj.batch_id}</td>
                <td>{adj.adjustment_type}</td>
                <td>{adj.reason_code}</td>
                <td>{adj.reason_notes ?? "—"}</td>
                <td>{adj.requested_by ?? "—"}</td>
                <td>{adj.posted_at ? new Date(adj.posted_at).toLocaleString() : "—"}</td>
                <td>
                  {adj.reversal_of_adjustment_id !== null
                    ? <span style={{ color: "var(--text-muted)" }}>Reversed</span>
                    : <button onClick={() => handleReverse(adj)}>Reverse</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  )
}

// ── Scrap Disposal ───────────────────────────────────────────────────────────

const MATERIAL_TYPES = ["Steel", "Stainless Steel", "Aluminium", "Other"]

export function ScrapDashboard({ company }: { company: string }) {
  const [holdings, setHoldings] = useState<ScrapHolding[] | null>(null)
  const [disposals, setDisposals] = useState<ScrapDisposal[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  // Form state
  const [merchant, setMerchant] = useState("")
  const [materialType, setMaterialType] = useState("Steel")
  const [weightKg, setWeightKg] = useState("")
  const [pricePerTonne, setPricePerTonne] = useState("")
  const [notes, setNotes] = useState("")

  const computedCredit = (() => {
    const w = parseFloat(weightKg)
    const p = parseFloat(pricePerTonne)
    if (!isNaN(w) && !isNaN(p) && w > 0 && p > 0) {
      return (w * p / 1000).toFixed(2)
    }
    return null
  })()

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      const [h, d] = await Promise.all([
        api.scrap.holdings(company),
        api.scrap.disposals(company),
      ])
      setHoldings(h)
      setDisposals(d)
    } catch (e) {
      setLoadErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [company])

  useEffect(() => { load() }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null)
    const w = parseFloat(weightKg)
    const p = parseFloat(pricePerTonne)
    if (isNaN(w) || w <= 0) { setFormErr("Weight must be a positive number"); return }
    if (isNaN(p) || p <= 0) { setFormErr("Price per tonne must be a positive number"); return }
    setSubmitting(true)
    try {
      await api.scrap.recordDisposal(company, {
        scrap_merchant: merchant,
        material_type: materialType,
        weight_kg: w,
        price_per_tonne: p,
        notes: notes || undefined,
      })
      setMerchant(""); setWeightKg(""); setPricePerTonne(""); setNotes("")
      await load()
    } catch (e) {
      setFormErr(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Shell loading={loading} error={loadErr}>
      <div className="page-header">
        <h2>Scrap Disposal</h2>
      </div>

      {/* Section 1: Current Holdings */}
      <h3 style={{ marginBottom: "0.5rem" }}>Current Scrap Holding</h3>
      {holdings !== null && holdings.length === 0 && (
        <p className="state-msg">No scrap accumulated.</p>
      )}
      {holdings !== null && holdings.length > 0 && (
        <table style={{ marginBottom: "1.5rem" }}>
          <thead>
            <tr>
              <th>Scrap Type</th>
              <th style={{ textAlign: "right" }}>Total Weight (kg)</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.scrap_type}>
                <td>{h.scrap_type}</td>
                <td style={{ textAlign: "right" }}>{Number(h.total_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Section 2: Record Disposal Form */}
      <div className="form-box" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Record Disposal</h3>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
          <label>
            Scrap Merchant
            <input value={merchant} onChange={e => setMerchant(e.target.value)} required placeholder="e.g. UK Metal Recycling" />
          </label>
          <label>
            Material Type
            <select value={materialType} onChange={e => setMaterialType(e.target.value)}>
              {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Weight (kg)
            <input type="number" min="0.001" step="0.001" value={weightKg} onChange={e => setWeightKg(e.target.value)} required placeholder="e.g. 1250.5" />
          </label>
          <label>
            Price per Tonne (£)
            <input type="number" min="0.01" step="0.01" value={pricePerTonne} onChange={e => setPricePerTonne(e.target.value)} required placeholder="e.g. 185.00" />
          </label>
          {computedCredit !== null && (
            <p style={{ margin: 0, fontWeight: 600, color: "var(--color-success, green)" }}>
              Credit value: £{computedCredit}
            </p>
          )}
          <label>
            Notes (optional)
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="e.g. Weighbridge ticket #1234" />
          </label>
          {formErr && <p className="err-msg">{formErr}</p>}
          <div>
            <button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Record Disposal"}</button>
          </div>
        </form>
      </div>

      {/* Section 3: Recent Disposals */}
      <h3 style={{ marginBottom: "0.5rem" }}>Recent Disposals</h3>
      {disposals !== null && disposals.length === 0 && (
        <p className="state-msg">No disposals recorded yet.</p>
      )}
      {disposals !== null && disposals.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Material</th>
              <th style={{ textAlign: "right" }}>Weight (kg)</th>
              <th style={{ textAlign: "right" }}>£/tonne</th>
              <th style={{ textAlign: "right" }}>Credit (£)</th>
              <th>Recorded By</th>
            </tr>
          </thead>
          <tbody>
            {disposals.map(d => (
              <tr key={d.id}>
                <td>{d.disposal_date}</td>
                <td>{d.scrap_merchant}</td>
                <td>{d.material_type}</td>
                <td style={{ textAlign: "right" }}>{Number(d.weight_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
                <td style={{ textAlign: "right" }}>{Number(d.price_per_tonne).toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{Number(d.total_credit).toFixed(2)}</td>
                <td>{d.recorded_by ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  )
}

export function SubcontractsView({ company }: { company: string }) {
  const [orders, setOrders] = useState<SubcontractOrder[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  // New subcontract form state
  const [woId, setWoId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [opDesc, setOpDesc] = useState("")
  const [batchIds, setBatchIds] = useState("")
  const [expectedReturn, setExpectedReturn] = useState("")
  const [costAgreed, setCostAgreed] = useState("")
  const [notes, setNotes] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      setOrders(await api.subcontracts.list(company))
    } catch (e) {
      setLoadErr(String(e))
    } finally {
      setLoading(false)
    }
  }, [company])

  useEffect(() => { load() }, [load])

  async function handleSend(id: number) {
    try {
      await api.subcontracts.send(company, id)
      await load()
    } catch (e) {
      alert(String(e))
    }
  }

  async function handleReturn(id: number, passed: boolean) {
    const failNotes = passed ? undefined : (prompt("Failure notes (optional):") ?? undefined)
    try {
      await api.subcontracts.return(company, id, { passed, notes: failNotes })
      await load()
    } catch (e) {
      alert(String(e))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null)
    const wo = parseInt(woId, 10)
    const sup = parseInt(supplierId, 10)
    if (isNaN(wo) || wo <= 0) { setFormErr("WO ID must be a positive integer"); return }
    if (isNaN(sup) || sup <= 0) { setFormErr("Supplier ID must be a positive integer"); return }
    const batches = batchIds.trim() ? batchIds.split(",").map(s => s.trim()).filter(Boolean) : []
    const cost = costAgreed.trim() ? parseFloat(costAgreed) : undefined
    setSubmitting(true)
    try {
      await api.subcontracts.create(company, {
        wo_id: wo,
        supplier_id: sup,
        operation_description: opDesc.trim() || undefined,
        batch_ids_out: batches,
        expected_return_date: expectedReturn || undefined,
        cost_agreed: cost,
        notes: notes.trim() || undefined,
      })
      setWoId(""); setSupplierId(""); setOpDesc(""); setBatchIds("")
      setExpectedReturn(""); setCostAgreed(""); setNotes("")
      await load()
    } catch (e) {
      setFormErr(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Shell loading={loading} error={loadErr}>
      <div className="page-header">
        <h2>Subcontract Orders</h2>
      </div>

      {orders !== null && orders.length === 0 && (
        <p className="state-msg">No subcontract orders yet.</p>
      )}
      {orders !== null && orders.length > 0 && (
        <table style={{ marginBottom: "1.5rem" }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>WO</th>
              <th>Supplier</th>
              <th>Operation</th>
              <th>Status</th>
              <th>Expected Return</th>
              <th style={{ textAlign: "right" }}>Agreed Cost (£)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.wo_id}</td>
                <td>{o.supplier_name ?? o.supplier_id}</td>
                <td>{o.operation_description ?? "—"}</td>
                <td>{o.status}</td>
                <td>{o.expected_return_date ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{o.cost_agreed != null ? Number(o.cost_agreed).toFixed(2) : "—"}</td>
                <td style={{ display: "flex", gap: "0.4rem" }}>
                  {o.status === "preparing" && (
                    <button onClick={() => handleSend(o.id)}>Send</button>
                  )}
                  {o.status === "sent" && (
                    <>
                      <button onClick={() => handleReturn(o.id, true)}>Return — Pass</button>
                      <button onClick={() => handleReturn(o.id, false)} style={{ background: "var(--color-danger, #c00)", color: "#fff" }}>Return — Fail</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="form-box">
        <h3 style={{ marginBottom: "0.5rem" }}>New Subcontract Order</h3>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
          <label>
            Works Order ID
            <input type="number" value={woId} onChange={e => setWoId(e.target.value)} required placeholder="e.g. 42" />
          </label>
          <label>
            Supplier ID
            <input type="number" value={supplierId} onChange={e => setSupplierId(e.target.value)} required placeholder="e.g. 7" />
          </label>
          <label>
            Operation Description
            <input value={opDesc} onChange={e => setOpDesc(e.target.value)} placeholder="e.g. Heat treatment" />
          </label>
          <label>
            Batch Numbers (comma-separated)
            <input value={batchIds} onChange={e => setBatchIds(e.target.value)} placeholder="e.g. B001, B002" />
          </label>
          <label>
            Expected Return Date
            <input type="date" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} />
          </label>
          <label>
            Agreed Cost (£)
            <input type="number" min="0" step="0.01" value={costAgreed} onChange={e => setCostAgreed(e.target.value)} placeholder="e.g. 250.00" />
          </label>
          <label>
            Notes (optional)
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </label>
          {formErr && <p className="err-msg">{formErr}</p>}
          <div>
            <button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Create Subcontract Order"}</button>
          </div>
        </form>
      </div>
    </Shell>
  )
}

// ── Customer Portal ──────────────────────────────────────────────────────────

export function PortalLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(""); setBusy(true)
    try {
      await portalLogin(email.trim(), password)
      onLogin()
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Login failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="picker">
      <div className="picker-inner">
        <div className="picker-logo">
          <div className="brand-icon">M</div>
          <span className="picker-brand">Customer Portal</span>
        </div>
        <form className="portal-login" onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {err && <p className="err-msg">{err}</p>}
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </div>
  )
}

function PortalCreditBadge({ status }: { status: PortalAccount["credit_status"] }) {
  const label = { in_credit: "In credit", near_limit: "Near limit", over_limit: "Over limit", on_hold: "On hold" }[status]
  return <span className={`credit-badge ${status}`}>{label}</span>
}

function notifEventLabel(eventType: Notification["event_type"]): string {
  if (eventType === "status_change") return "Order status update"
  if (eventType === "new_invoice") return "New invoice"
  return "New document"
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function PortalDashboard({ onNav }: { onNav: (m: string) => void }) {
  const [orders, setOrders] = useState<PortalOrder[] | null>(null)
  const [account, setAccount] = useState<PortalAccount | null>(null)
  const [me, setMe] = useState<PortalMe | null>(null)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [err, setErr] = useState("")

  useEffect(() => {
    Promise.all([portalApi.me(), portalApi.orders(), portalApi.account()])
      .then(([m, o, a]) => { setMe(m); setOrders(o); setAccount(a) })
      .catch(x => setErr(x instanceof Error ? x.message : "Failed to load"))
    portalApi.notifications()
      .then(ns => setNotifs(ns.filter(n => !n.is_read).slice(0, 3)))
      .catch(() => { /* non-fatal */ })
  }, [])

  if (err) return <p className="err-msg">{err}</p>
  if (!orders || !account) return <p className="state-msg">Loading…</p>

  const recent = orders.slice(0, 5)
  return (
    <div className="portal-page">
      <h1 className="page-h1">Welcome{me?.full_name ? `, ${me.full_name}` : ""}</h1>
      <div className="card-grid">
        <div className="summary-card">
          <span className="summary-label">Open orders</span>
          <strong className="summary-value">{orders.filter(o => o.customer_status !== "Complete").length}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Account balance</span>
          <strong className="summary-value">{fmtGbp(account.current_balance_gbp)}</strong>
        </div>
        <div className="summary-card">
          <span className="summary-label">Credit status</span>
          <strong className="summary-value"><PortalCreditBadge status={account.credit_status} /></strong>
        </div>
      </div>
      {notifs.length > 0 && (
        <div>
          <div className="toolbar-row">
            <h2 className="page-h2">Recent alerts</h2>
            <button onClick={() => onNav("notifications")}>View all</button>
          </div>
          <ul className="notif-list">
            {notifs.map(n => (
              <li key={n.id} className="notif-row notif-unread">
                <span className="notif-label">{notifEventLabel(n.event_type)}</span>
                <span className="notif-ref">{n.entity_ref}</span>
                <span className="notif-time">{relativeTime(n.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="toolbar-row">
        <h2 className="page-h2">Recent orders</h2>
        <button onClick={() => onNav("orders")}>View all</button>
      </div>
      {recent.length === 0 ? <p className="state-msg">No orders yet.</p> : (
        <table className="data-table">
          <thead><tr><th>Order</th><th>Your ref</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {recent.map(o => (
              <tr key={o.order_no}>
                <td>{o.order_no}</td>
                <td>{o.customer_ref ?? "—"}</td>
                <td>{o.customer_status}</td>
                <td>{fmtGbp(o.total_gbp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function PortalOrders() {
  const [orders, setOrders] = useState<PortalOrder[] | null>(null)
  const [err, setErr] = useState("")
  const [bundling, setBundling] = useState<string | null>(null)
  const [bundleErr, setBundleErr] = useState("")
  useEffect(() => {
    portalApi.orders().then(setOrders).catch(x => setErr(x instanceof Error ? x.message : "Failed to load"))
  }, [])
  async function downloadBundle(orderNo: string) {
    setBundling(orderNo)
    setBundleErr("")
    try {
      const data = await portalApi.bundleUrl(orderNo)
      window.open(data.url, "_blank")
    } catch (x) {
      setBundleErr(x instanceof Error ? x.message : "Failed to build bundle")
    } finally {
      setBundling(null)
    }
  }
  if (err) return <p className="err-msg">{err}</p>
  if (!orders) return <p className="state-msg">Loading…</p>
  return (
    <div className="portal-page">
      <h1 className="page-h1">Your orders</h1>
      {bundleErr && <p className="err-msg">{bundleErr}</p>}
      {orders.length === 0 ? <p className="state-msg">No orders yet.</p> : (
        <table className="data-table">
          <thead><tr><th>Order</th><th>Date</th><th>Your ref</th><th>Status</th><th>Net</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.order_no}>
                <td>{o.order_no}</td>
                <td>{o.order_date_serial ?? "—"}</td>
                <td>{o.customer_ref ?? "—"}</td>
                <td>{o.customer_status}</td>
                <td>{fmtGbp(o.net_gbp)}</td>
                <td>{fmtGbp(o.total_gbp)}</td>
                <td>
                  <button
                    className="btn-sm"
                    disabled={bundling === o.order_no}
                    onClick={() => downloadBundle(o.order_no)}
                  >
                    {bundling === o.order_no ? "Building…" : "Download all documents"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function PortalAccountView() {
  const [account, setAccount] = useState<PortalAccount | null>(null)
  const [invoices, setInvoices] = useState<PortalInvoice[] | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => {
    Promise.all([portalApi.account(), portalApi.invoices()])
      .then(([a, i]) => { setAccount(a); setInvoices(i) })
      .catch(x => setErr(x instanceof Error ? x.message : "Failed to load"))
  }, [])
  if (err) return <p className="err-msg">{err}</p>
  if (!account || !invoices) return <p className="state-msg">Loading…</p>
  return (
    <div className="portal-page">
      <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <h1 className="page-h1" style={{ margin: 0 }}>{account.account_name ?? "Your account"}</h1>
        <button className="action-btn" onClick={async () => { try { window.open(await portalApi.statementPdfUrl(), "_blank") } catch (e) { alert(String(e)) } }}>Statement PDF</button>
      </div>
      <dl className="detail-grid">
        <dt>Credit status</dt><dd><PortalCreditBadge status={account.credit_status} /></dd>
        <dt>Credit limit</dt><dd>{fmtGbp(account.credit_limit_gbp)}</dd>
        <dt>Balance</dt><dd>{fmtGbp(account.current_balance_gbp)}</dd>
        <dt>Available</dt><dd>{fmtGbp(account.available_gbp)}</dd>
      </dl>
      <h2 className="page-h2">Recent invoices</h2>
      {invoices.length === 0 ? <p className="state-msg">No invoices.</p> : (
        <table className="data-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Order</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i.doc_no}>
                <td>{i.doc_no}</td>
                <td>{i.invoice_date_serial ?? "—"}</td>
                <td>{i.sales_order_no ?? "—"}</td>
                <td>{i.status ?? "—"}</td>
                <td>{fmtGbp(i.total_gbp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function PortalNotifications() {
  const [notifs, setNotifs] = useState<Notification[] | null>(null)
  const [err, setErr] = useState("")
  const [marking, setMarking] = useState<Set<string>>(new Set())

  useEffect(() => {
    portalApi.notifications()
      .then(setNotifs)
      .catch(x => setErr(x instanceof Error ? x.message : "Failed to load"))
  }, [])

  async function markOne(id: string) {
    setMarking(prev => new Set(prev).add(id))
    try {
      await portalApi.markRead(id)
      setNotifs(prev => prev ? prev.map(n => n.id === id ? { ...n, is_read: true } : n) : prev)
    } catch {
      // best-effort
    } finally {
      setMarking(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function markAll() {
    if (!notifs) return
    const unread = notifs.filter(n => !n.is_read)
    await Promise.all(unread.map(n => markOne(n.id)))
  }

  if (err) return <p className="err-msg">{err}</p>
  if (!notifs) return <p className="state-msg">Loading…</p>

  const unreadCount = notifs.filter(n => !n.is_read).length

  return (
    <div className="portal-page">
      <div className="toolbar-row">
        <h1 className="page-h1">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAll}>Mark all read</button>
        )}
      </div>
      {notifs.length === 0 ? <p className="state-msg">No notifications yet.</p> : (
        <ul className="notif-list">
          {notifs.map(n => (
            <li key={n.id} className={`notif-row${n.is_read ? "" : " notif-unread"}`}>
              <span className="notif-icon">{n.event_type === "status_change" ? "↺" : n.event_type === "new_invoice" ? "£" : "📄"}</span>
              <div className="notif-body">
                <span className="notif-label">{notifEventLabel(n.event_type)}</span>
                {n.event_type === "status_change" ? (
                  <a href={`#/portal/orders/${encodeURIComponent(n.entity_ref)}`} className="notif-ref">{n.entity_ref}</a>
                ) : (
                  <span className="notif-ref">{n.entity_ref}</span>
                )}
              </div>
              <span className="notif-time">{relativeTime(n.created_at)}</span>
              {!n.is_read && (
                <button
                  className="btn-sm"
                  disabled={marking.has(n.id)}
                  onClick={() => markOne(n.id)}
                >
                  {marking.has(n.id) ? "…" : "Mark read"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const PREF_LABELS: Record<string, string> = {
  status_change: "Order status update",
  new_invoice: "New invoice",
  new_document: "New document",
}

export function PortalNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotifPref[] | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    portalApi.getPrefs()
      .then(setPrefs)
      .catch(x => setErr(x instanceof Error ? x.message : "Failed to load"))
  }, [])

  async function toggle(eventType: string, field: "email_enabled" | "in_portal_enabled", value: boolean) {
    if (!prefs) return
    const pref = prefs.find(p => p.event_type === eventType)
    if (!pref) return
    const updated: NotifPref = { ...pref, [field]: value }
    setPrefs(prev => prev ? prev.map(p => p.event_type === eventType ? updated : p) : prev)
    try {
      await portalApi.updatePref(updated)
    } catch {
      // revert on failure
      setPrefs(prev => prev ? prev.map(p => p.event_type === eventType ? pref : p) : prev)
    }
  }

  if (err) return <p className="err-msg">{err}</p>
  if (!prefs) return <p className="state-msg">Loading…</p>

  return (
    <div className="portal-page">
      <h1 className="page-h1">Notification settings</h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Email</th>
            <th>In portal</th>
          </tr>
        </thead>
        <tbody>
          {prefs.map(p => (
            <tr key={p.event_type}>
              <td>{PREF_LABELS[p.event_type] ?? p.event_type}</td>
              <td>
                <input
                  type="checkbox"
                  checked={p.email_enabled}
                  onChange={e => toggle(p.event_type, "email_enabled", e.target.checked)}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={p.in_portal_enabled}
                  onChange={e => toggle(p.event_type, "in_portal_enabled", e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PortalApp() {
  const [token, setToken] = useState(() => localStorage.getItem("portal_token"))
  const [view, setView] = useState(() => (window.location.hash.split("/")[2] || "dashboard"))
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const h = () => setView(window.location.hash.split("/")[2] || "dashboard")
    window.addEventListener("hashchange", h)
    return () => window.removeEventListener("hashchange", h)
  }, [])

  useEffect(() => {
    if (!token) return
    portalApi.notifications()
      .then(ns => setUnreadCount(ns.filter(n => !n.is_read).length))
      .catch(() => { /* non-fatal */ })
  }, [token])

  if (!token) return <PortalLogin onLogin={() => setToken(localStorage.getItem("portal_token"))} />

  const nav = (m: string) => { window.location.hash = `#/portal/${m}` }
  const logout = () => { localStorage.removeItem("portal_token"); setToken(null) }

  return (
    <div className="layout portal-layout">
      <header>
        <span className="brand-wrap"><div className="brand-icon">M</div><span className="brand-name">Customer Portal</span></span>
        <nav>
          <a href="#/portal/dashboard" className={view === "dashboard" ? "active" : undefined}>Dashboard</a>
          <a href="#/portal/orders" className={view === "orders" ? "active" : undefined}>Orders</a>
          <a href="#/portal/account" className={view === "account" ? "active" : undefined}>Account</a>
          <a href="#/portal/notifications" className={view === "notifications" ? "active" : undefined}>
            Notifications{unreadCount > 0 ? <span className="notif-badge">{unreadCount}</span> : null}
          </a>
          <a href="#/portal/settings" className={view === "settings" ? "active" : undefined}>Settings</a>
        </nav>
        <button className="signout-btn" onClick={logout}>Log out</button>
      </header>
      <main>
        {view === "dashboard" && <PortalDashboard onNav={nav} />}
        {view === "orders" && <PortalOrders />}
        {view === "account" && <PortalAccountView />}
        {view === "notifications" && <PortalNotifications />}
        {view === "settings" && <PortalNotificationPrefs />}
      </main>
    </div>
  )
}

// ─── A5: Production Scheduling Board ────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function fmtSchedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function CapacityBar({ booked, avail }: { booked: number; avail: number }) {
  const pct = Math.min(100, avail > 0 ? (booked / avail) * 100 : 0)
  const cls = pct >= 90 ? "cap-red" : pct >= 70 ? "cap-amber" : "cap-green"
  return (
    <div className="cap-bar" title={`${booked}/${avail} min booked`}>
      <div className={`cap-fill ${cls}`} style={{ width: `${pct}%` }} />
      <span className="cap-label">{booked}/{avail}m</span>
    </div>
  )
}

export function ProductionSchedule({ company }: { company: string }) {
  const today = toDateStr(new Date())
  const twoWeeks = toDateStr(new Date(Date.now() + 13 * 86400000))
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(twoWeeks)
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [booked, setBooked] = useState<BookedSlot[]>([])
  const [unscheduled, setUnscheduled] = useState<UnscheduledWO[]>([])
  const [scheduling, setScheduling] = useState<UnscheduledWO | null>(null)
  const [form, setForm] = useState({ machine_id: 0, start_date: today, start_time: "08:00", hours: "2" })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function load() {
    api.scheduling.machines(company).then(setMachines).catch(() => {})
    api.scheduling.schedule(company, dateFrom, dateTo).then(r => {
      setEntries(r.schedules)
      setBooked(r.booked)
    }).catch(() => {})
    api.scheduling.unscheduled(company).then(setUnscheduled).catch(() => {})
  }

  useEffect(() => { load() }, [company, dateFrom, dateTo])

  function days(): string[] {
    const result: string[] = []
    const cur = new Date(dateFrom)
    const end = new Date(dateTo)
    while (cur <= end) { result.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1) }
    return result
  }

  function entriesFor(machineId: number, day: string) {
    return entries.filter(e => e.machine_id === machineId && e.scheduled_start.slice(0, 10) === day)
  }

  function bookedFor(machineId: number, day: string) {
    return booked.find(b => b.machine_id === machineId && b.date === day)
  }

  async function saveSchedule() {
    if (!scheduling || !form.machine_id) return
    setSaving(true); setErr(null)
    try {
      const start = new Date(`${form.start_date}T${form.start_time}:00`)
      const end = new Date(start.getTime() + parseFloat(form.hours) * 3600000)
      await api.scheduling.create(company, {
        machine_id: form.machine_id,
        wo_id: scheduling.id,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        est_minutes: Math.round(parseFloat(form.hours) * 60),
      })
      setScheduling(null)
      load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed")
    } finally { setSaving(false) }
  }

  async function removeEntry(id: number) {
    if (!confirm("Remove this schedule entry?")) return
    await api.scheduling.remove(company, id)
    load()
  }

  const dayList = days()

  return (
    <div className="schedule-board">
      <div className="schedule-toolbar">
        <h2>Production Schedule</h2>
        <label>From <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
        <label>To <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
      </div>

      <div className="schedule-layout">
        {/* Unscheduled WO queue */}
        <div className="unscheduled-queue">
          <h3>Unscheduled ({unscheduled.length})</h3>
          {unscheduled.map(wo => (
            <div key={wo.id} className="unscheduled-card">
              <strong>{wo.wo_no}</strong>
              <span>{wo.operation_type ?? "—"}</span>
              <small>{wo.grade ?? ""} {wo.batch_desc ?? ""}</small>
              <button className="btn-sm" onClick={() => {
                setScheduling(wo)
                setForm(f => ({ ...f, machine_id: machines[0]?.id ?? 0 }))
              }}>Schedule</button>
            </div>
          ))}
          {unscheduled.length === 0 && <p className="empty-msg">All works orders scheduled</p>}
        </div>

        {/* Gantt */}
        <div className="gantt-wrap">
          <table className="gantt-table">
            <thead>
              <tr>
                <th className="gantt-machine-col">Machine</th>
                {dayList.map(d => (
                  <th key={d} className="gantt-day-col">{fmtSchedDate(d + "T00:00:00")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {machines.map(m => (
                <tr key={m.id}>
                  <td className="gantt-machine-cell">
                    <strong>{m.code}</strong>
                    <span>{m.machine_type ?? ""}</span>
                  </td>
                  {dayList.map(d => {
                    const slots = entriesFor(m.id, d)
                    const cap = bookedFor(m.id, d)
                    return (
                      <td key={d} className="gantt-day-cell">
                        {cap && <CapacityBar booked={cap.booked_mins} avail={cap.avail_mins} />}
                        {slots.map(e => (
                          <div key={e.id} className="gantt-block" title={`${e.wo_no ?? "Block"} ${fmtTime(e.scheduled_start)}–${fmtTime(e.scheduled_end)}`}>
                            <span>{e.wo_no ?? e.notes ?? "Block"}</span>
                            <span className="gantt-time">{fmtTime(e.scheduled_start)}</span>
                            <button className="gantt-del" onClick={() => removeEntry(e.id)} title="Remove">×</button>
                          </div>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule modal */}
      {scheduling && (
        <div className="modal-overlay">
          <div className="modal" style={{ minWidth: 320 }}>
            <h3>Schedule {scheduling.wo_no}</h3>
            <p className="text-sm">{scheduling.operation_type} — {scheduling.grade} {scheduling.batch_desc}</p>
            {err && <p className="error-msg">{err}</p>}
            <label>Machine
              <select value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: +e.target.value }))}>
                <option value={0}>— pick —</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.code} {m.name ?? ""}</option>)}
              </select>
            </label>
            <label>Date <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></label>
            <label>Start <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} /></label>
            <label>Duration (hours) <input type="number" min="0.5" step="0.5" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} /></label>
            <div className="modal-actions">
              <button className="btn" onClick={saveSchedule} disabled={saving || !form.machine_id}>
                {saving ? "Saving…" : "Confirm"}
              </button>
              <button className="btn-ghost" onClick={() => { setScheduling(null); setErr(null) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── A2: EDI Admin View ──────────────────────────────────────────────────────

export function EdiView({ company }: { company: string }) {
  const [tab, setTab] = useState<"partners" | "transactions">("transactions")
  const [partners, setPartners] = useState<EdiPartner[]>([])
  const [transactions, setTransactions] = useState<EdiTransaction[]>([])
  const [statusFilter, setStatusFilter] = useState("")
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editPartner, setEditPartner] = useState<Partial<EdiPartner> | null>(null)
  const [pSaving, setPSaving] = useState(false)
  const [pErr, setPErr] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<(EdiTransaction & { raw_content: string; parsed_content: unknown }) | null>(null)

  function loadPartners() { api.edi.partners(company).then(setPartners).catch(() => {}) }
  function loadTxs() { api.edi.transactions(company, statusFilter || undefined).then(setTransactions).catch(() => {}) }

  useEffect(() => { loadPartners(); loadTxs() }, [company, statusFilter])

  useEffect(() => {
    if (detailId == null) { setDetail(null); return }
    api.edi.getTransaction(company, detailId).then(setDetail).catch(() => {})
  }, [company, detailId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); setUploadResult(null)
    try {
      const r = await api.edi.upload(company, file)
      setUploadResult(`${r.status}: ${r.message_type} tx#${r.tx_id}${r.so_no ? ` → ${r.so_no}` : ""}`)
      loadTxs()
    } catch (ex) {
      setUploadResult(`Error: ${ex instanceof Error ? ex.message : String(ex)}`)
    } finally { setUploading(false); e.target.value = "" }
  }

  async function savePartner() {
    if (!editPartner?.partner_name || !editPartner?.partner_id) return
    setPSaving(true); setPErr(null)
    try {
      if (editPartner.id) {
        await api.edi.updatePartner(company, editPartner.id, editPartner as Parameters<typeof api.edi.updatePartner>[2])
      } else {
        await api.edi.createPartner(company, editPartner as Parameters<typeof api.edi.createPartner>[2])
      }
      setEditPartner(null); loadPartners()
    } catch (ex) { setPErr(ex instanceof Error ? ex.message : String(ex)) }
    finally { setPSaving(false) }
  }

  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={{ marginBottom: "1rem" }}>EDI</h2>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: ".5rem", alignItems: "center", fontSize: ".88rem" }}>
          Upload inbound file:
          <input type="file" accept=".edi,.txt,.x12,.edifact" onChange={handleUpload} disabled={uploading} />
        </label>
        {uploading && <span>Uploading…</span>}
        {uploadResult && <span className="badge">{uploadResult}</span>}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button className={tab === "transactions" ? "btn" : "btn-ghost"} onClick={() => setTab("transactions")}>Transactions</button>
        <button className={tab === "partners" ? "btn" : "btn-ghost"} onClick={() => setTab("partners")}>Trading Partners</button>
      </div>

      {tab === "transactions" && (<>
        <div style={{ marginBottom: ".5rem", display: "flex", gap: ".5rem", alignItems: "center" }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ fontSize: ".85rem" }}>
            <option value="">All statuses</option>
            {["pending","processed","error","skipped"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <table className="data-table">
          <thead>
            <tr><th>ID</th><th>Partner</th><th>Dir</th><th>Type</th><th>File</th><th>Status</th><th>SO</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            {transactions.map(t => (
              <tr key={t.id} className={t.status === "error" ? "row-error" : undefined}>
                <td><code>{t.id}</code></td>
                <td>{t.partner_id}</td>
                <td>{t.direction}</td>
                <td>{t.message_type ?? "—"}</td>
                <td style={{ fontSize: ".78rem" }}>{t.filename ?? "—"}</td>
                <td><Badge value={t.status} /></td>
                <td>{t.linked_so_no ? <a href={`#/${company}/sales-orders/${encodeURIComponent(t.linked_so_no)}`}>{t.linked_so_no}</a> : "—"}</td>
                <td style={{ fontSize: ".8rem" }}>{t.created_at.slice(0, 16).replace("T", " ")}</td>
                <td style={{ display: "flex", gap: ".3rem" }}>
                  <button className="btn-sm" onClick={() => setDetailId(detailId === t.id ? null : t.id)}>Detail</button>
                  {t.status === "error" && (
                    <button className="btn-sm" onClick={async () => { await api.edi.retry(company, t.id); loadTxs() }}>Retry</button>
                  )}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && <tr><td colSpan={9} className="empty-msg">No transactions</td></tr>}
          </tbody>
        </table>
        {detail && (
          <div style={{ marginTop: "1rem", background: "var(--color-card-bg,#f8f8f8)", border: "1px solid var(--border,#ddd)", borderRadius: 6, padding: "1rem" }}>
            <h4>Transaction #{detail.id} — {detail.message_type}</h4>
            {detail.error_message && <p style={{ color: "#b91c1c" }}>{detail.error_message}</p>}
            <details>
              <summary style={{ cursor: "pointer", fontSize: ".85rem" }}>Parsed content</summary>
              <pre style={{ fontSize: ".75rem", overflow: "auto", maxHeight: 200 }}>{JSON.stringify(detail.parsed_content, null, 2)}</pre>
            </details>
            <details>
              <summary style={{ cursor: "pointer", fontSize: ".85rem" }}>Raw file</summary>
              <pre style={{ fontSize: ".72rem", overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap" }}>{detail.raw_content}</pre>
            </details>
          </div>
        )}
      </>)}

      {tab === "partners" && (<>
        <button className="btn" style={{ marginBottom: ".75rem" }} onClick={() => setEditPartner({ is_active: true, standard: "EDIFACT", direction: "inbound" })}>
          + Add partner
        </button>
        {editPartner && (
          <div style={{ background: "var(--color-card-bg,#f8f8f8)", border: "1px solid var(--border,#ddd)", borderRadius: 6, padding: "1rem", marginBottom: "1rem", maxWidth: 480 }}>
            <h4 style={{ margin: "0 0 .75rem" }}>{editPartner.id ? "Edit" : "New"} Trading Partner</h4>
            {pErr && <p style={{ color: "#b91c1c" }}>{pErr}</p>}
            {(["partner_name", "partner_id", "notes"] as const).map(f => (
              <label key={f} style={{ display: "block", marginBottom: ".4rem", fontSize: ".85rem" }}>
                {f.replace(/_/g, " ")}
                <input value={(editPartner as Record<string, string>)[f] ?? ""} style={{ display: "block", width: "100%", marginTop: ".15rem" }}
                  onChange={e => setEditPartner(p => ({ ...p, [f]: e.target.value }))} />
              </label>
            ))}
            <label style={{ display: "block", marginBottom: ".4rem", fontSize: ".85rem" }}>Standard
              <select value={editPartner.standard ?? "EDIFACT"} style={{ display: "block", marginTop: ".15rem" }}
                onChange={e => setEditPartner(p => ({ ...p, standard: e.target.value }))}>
                <option>EDIFACT</option><option>X12</option>
              </select>
            </label>
            <label style={{ display: "flex", gap: ".4rem", alignItems: "center", fontSize: ".85rem", marginBottom: ".5rem" }}>
              <input type="checkbox" checked={editPartner.is_active ?? true}
                onChange={e => setEditPartner(p => ({ ...p, is_active: e.target.checked }))} />
              Active
            </label>
            <div style={{ display: "flex", gap: ".5rem" }}>
              <button className="btn" onClick={savePartner} disabled={pSaving}>{pSaving ? "Saving…" : "Save"}</button>
              <button className="btn-ghost" onClick={() => { setEditPartner(null); setPErr(null) }}>Cancel</button>
            </div>
          </div>
        )}
        <table className="data-table">
          <thead><tr><th>Name</th><th>Partner ID</th><th>Standard</th><th>Customer</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {partners.map(p => (
              <tr key={p.id}>
                <td>{p.partner_name}</td>
                <td><code>{p.partner_id}</code></td>
                <td>{p.standard}</td>
                <td>{p.customer_name ?? p.customer_account ?? "—"}</td>
                <td>{p.is_active ? "✓" : "—"}</td>
                <td><button className="btn-sm" onClick={() => setEditPartner({ ...p })}>Edit</button></td>
              </tr>
            ))}
            {partners.length === 0 && <tr><td colSpan={6} className="empty-msg">No trading partners configured</td></tr>}
          </tbody>
        </table>
      </>)}
    </div>
  )
}

// ── Grade Register ─────────────────────────────────────────────────────────────

export function GradeRegisterView({ company }: { company: string }) {
  const { data: grades, refresh } = useData(() => api.grades.list(company), [company])
  const [form, setForm] = useState({ grade_code: "", standard: "", material_type: "", density: "", min_cert_default: "" })
  const [surchargeForm, setSurchargeForm] = useState({ grade_code: "", surcharge_per_tonne_pence: "", effective_from: "" })
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function saveGrade() {
    setErr(null); setMsg(null)
    try {
      await api.grades.upsert(company, {
        grade_code: form.grade_code.trim(),
        standard: form.standard || undefined,
        material_type: form.material_type || undefined,
        density: form.density ? parseFloat(form.density) : undefined,
        min_cert_default: form.min_cert_default || undefined,
      })
      setMsg("Grade saved"); setForm({ grade_code: "", standard: "", material_type: "", density: "", min_cert_default: "" })
      refresh()
    } catch (e) { setErr(String(e)) }
  }

  async function delGrade(gc: string) {
    if (!confirm(`Delete grade ${gc}?`)) return
    setErr(null)
    try { await api.grades.delete(company, gc); refresh() }
    catch (e) { setErr(String(e)) }
  }

  async function saveSurcharge() {
    setErr(null); setMsg(null)
    try {
      await api.grades.addSurcharge(company, {
        grade_code: surchargeForm.grade_code.trim(),
        surcharge_per_tonne_pence: Math.round(parseFloat(surchargeForm.surcharge_per_tonne_pence) * 100),
        effective_from: surchargeForm.effective_from || undefined,
      })
      setMsg("Surcharge added"); setSurchargeForm({ grade_code: "", surcharge_per_tonne_pence: "", effective_from: "" })
      refresh()
    } catch (e) { setErr(String(e)) }
  }

  return (
    <div className="view-container">
      <Toolbar title="Grade Register" />
      {err && <div className="gate-msg gate-msg--block">{err}</div>}
      {msg && <div className="gate-msg gate-msg--warn">{msg}</div>}

      <table className="data-table">
        <thead>
          <tr><th>Grade</th><th>Standard</th><th>Material type</th><th>Density</th><th>Min cert</th><th>Current surcharge £/t</th><th></th></tr>
        </thead>
        <tbody>
          {(grades ?? []).map(g => (
            <tr key={g.grade_code}>
              <td><code>{g.grade_code}</code></td>
              <td>{g.standard ?? "—"}</td>
              <td>{g.material_type ?? "—"}</td>
              <td>{g.density != null ? `${g.density} g/cm³` : "—"}</td>
              <td>{g.min_cert_default ?? "—"}</td>
              <td>{g.current_surcharge_pence != null ? `£${(g.current_surcharge_pence / 100).toFixed(2)}` : "—"}</td>
              <td><button className="link-btn" onClick={() => delGrade(g.grade_code)}>Delete</button></td>
            </tr>
          ))}
          {!grades?.length && <tr><td colSpan={7} className="empty-msg">No grades registered</td></tr>}
        </tbody>
      </table>

      <details style={{ marginTop: "1.5rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: "0.5rem" }}>Add / update grade</summary>
        <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.5rem 1rem", maxWidth: "34em", marginTop: "0.5rem" }}>
          <label>Grade code *</label>
          <input value={form.grade_code} onChange={e => setForm(f => ({ ...f, grade_code: e.target.value.toUpperCase() }))} placeholder="e.g. 316L" />
          <label>Standard</label>
          <input value={form.standard} onChange={e => setForm(f => ({ ...f, standard: e.target.value }))} placeholder="e.g. EN 10088" />
          <label>Material type</label>
          <select value={form.material_type} onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))}>
            <option value="">— select —</option>
            <option>Stainless</option><option>Alloy</option><option>Carbon</option><option>Tool</option><option>Nickel alloy</option>
          </select>
          <label>Density (g/cm³)</label>
          <input type="number" step="0.001" value={form.density} onChange={e => setForm(f => ({ ...f, density: e.target.value }))} placeholder="e.g. 7.98" />
          <label>Min cert default</label>
          <select value={form.min_cert_default} onChange={e => setForm(f => ({ ...f, min_cert_default: e.target.value }))}>
            <option value="">— none —</option>
            <option>EN 10204 2.1</option><option>EN 10204 2.2</option><option>EN 10204 3.1</option><option>EN 10204 3.2</option>
          </select>
        </div>
        <button className="action-btn" style={{ marginTop: "0.75rem" }} onClick={saveGrade} disabled={!form.grade_code.trim()}>Save grade</button>
      </details>

      <details style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: "0.5rem" }}>Add alloy surcharge</summary>
        <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.5rem 1rem", maxWidth: "34em", marginTop: "0.5rem" }}>
          <label>Grade code *</label>
          <input value={surchargeForm.grade_code} onChange={e => setSurchargeForm(f => ({ ...f, grade_code: e.target.value.toUpperCase() }))} placeholder="Must match a registered grade" />
          <label>Surcharge £/tonne *</label>
          <input type="number" step="0.01" value={surchargeForm.surcharge_per_tonne_pence} onChange={e => setSurchargeForm(f => ({ ...f, surcharge_per_tonne_pence: e.target.value }))} placeholder="e.g. 450.00" />
          <label>Effective from</label>
          <input type="date" value={surchargeForm.effective_from} onChange={e => setSurchargeForm(f => ({ ...f, effective_from: e.target.value }))} />
        </div>
        <button className="action-btn" style={{ marginTop: "0.75rem" }}
          onClick={saveSurcharge}
          disabled={!surchargeForm.grade_code.trim() || !surchargeForm.surcharge_per_tonne_pence}>Add surcharge</button>
      </details>
    </div>
  )
}

const NCR_STATUSES = ["open", "investigating", "disposition", "closed"]
const NCR_DISPOSITIONS = ["pending", "rework", "scrap", "return_to_supplier", "use_as_is"]
const NCR_SOURCES = ["subcontract", "pod_exception", "goods_in", "other"]

function ncrStatusBadge(status: string) {
  const cls =
    status === "closed" ? "badge-success" :
    status === "open" ? "badge-warn" :
    "badge-info"
  return <span className={`badge ${cls}`}>{status}</span>
}

export function NCRList({ company, onSelect }: { company: string; onSelect: (id: string) => void }) {
  const [statusF, setStatusF] = useState("open")
  const [sourceF, setSourceF] = useState("")

  const { data: rows, loading, error } = useData<NcrRow[]>(
    () => api.ncr.list(company, {
      status: statusF || undefined,
      source: sourceF || undefined,
    }),
    [company, statusF, sourceF],
  )

  return (
    <div className="view-root">
      <Toolbar title="NCR / RMA">
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ marginLeft: "0.75rem" }}>
          <option value="">All statuses</option>
          {NCR_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sourceF} onChange={e => setSourceF(e.target.value)} style={{ marginLeft: "0.5rem" }}>
          <option value="">All sources</option>
          {NCR_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Toolbar>
      {loading && <p className="state-msg">Loading…</p>}
      {error && <p className="state-msg error">{error}</p>}
      {rows && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Source</th>
              <th>Ref</th>
              <th>Description</th>
              <th>Assigned to</th>
              <th>Status</th>
              <th>Raised</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>No NCRs found</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="clickable-row" onClick={() => onSelect(String(r.id))}>
                <td>{r.id}</td>
                <td>{r.source}</td>
                <td>{r.source_ref ?? "—"}</td>
                <td>{r.description}</td>
                <td>{r.assigned_to ?? "—"}</td>
                <td>{ncrStatusBadge(r.status)}</td>
                <td>{fmtDate(r.raised_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function NCRDetail({ company, id }: { company: string; id: string }) {
  const [ncr, setNcr] = useState<NcrRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const [form, setForm] = useState({
    assigned_to: "",
    root_cause: "",
    disposition: "",
    corrective_action: "",
    rma_no: "",
  })

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.ncr.get(company, id)
      .then(d => {
        setNcr(d)
        setForm({
          assigned_to: d.assigned_to ?? "",
          root_cause: d.root_cause ?? "",
          disposition: d.disposition ?? "",
          corrective_action: d.corrective_action ?? "",
          rma_no: d.rma_no ?? "",
        })
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [company, id])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setMsg(null)
    try {
      await api.ncr.update(company, id, {
        assigned_to: form.assigned_to || undefined,
        root_cause: form.root_cause || undefined,
        disposition: form.disposition || undefined,
        corrective_action: form.corrective_action || undefined,
        rma_no: form.rma_no || undefined,
      })
      setMsg("Saved")
      load()
    } catch (e) { setMsg(String(e)) } finally { setSaving(false) }
  }

  async function closeNcr() {
    if (!window.confirm("Close this NCR?")) return
    setSaving(true); setMsg(null)
    try {
      await api.ncr.close(company, id)
      setMsg("NCR closed")
      load()
    } catch (e) { setMsg(String(e)) } finally { setSaving(false) }
  }

  if (loading) return <p className="state-msg">Loading…</p>
  if (error) return <p className="state-msg error">{error}</p>
  if (!ncr) return null

  const canClose = !!ncr.disposition && ncr.status !== "closed"

  return (
    <div className="view-root">
      <Toolbar title={`NCR #${ncr.id}`}>
        {ncrStatusBadge(ncr.status)}
      </Toolbar>

      <div className="detail-grid" style={{ maxWidth: "48em" }}>
        <div className="detail-row"><span className="detail-label">Source</span><span>{ncr.source}{ncr.source_ref ? ` — ${ncr.source_ref}` : ""}</span></div>
        <div className="detail-row"><span className="detail-label">Description</span><span>{ncr.description}</span></div>
        <div className="detail-row"><span className="detail-label">Raised by</span><span>{ncr.raised_by ?? "—"}</span></div>
        <div className="detail-row"><span className="detail-label">Raised at</span><span>{fmtDate(ncr.raised_at)}</span></div>
        {ncr.batch_no && (
          <div className="detail-row"><span className="detail-label">Batch</span><span>{ncr.batch_no}{ncr.batch_description ? ` — ${ncr.batch_description}` : ""}{ncr.grade ? ` (${ncr.grade})` : ""}</span></div>
        )}
        {ncr.resolved_at && (
          <div className="detail-row"><span className="detail-label">Resolved</span><span>{fmtDate(ncr.resolved_at)} by {ncr.resolved_by ?? "—"}</span></div>
        )}
      </div>

      <div className="form-section" style={{ marginTop: "1.5rem", maxWidth: "36em" }}>
        <h2 className="section-h2">Edit NCR</h2>
        <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.5rem 1rem" }}>
          <label>Assigned to</label>
          <input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} disabled={ncr.status === "closed"} />

          <label>Root cause</label>
          <textarea rows={3} value={form.root_cause} onChange={e => setForm(f => ({ ...f, root_cause: e.target.value }))} disabled={ncr.status === "closed"} />

          <label>Disposition</label>
          <select value={form.disposition} onChange={e => setForm(f => ({ ...f, disposition: e.target.value }))} disabled={ncr.status === "closed"}>
            <option value="">— select —</option>
            {NCR_DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {form.disposition === "return_to_supplier" && <>
            <label>RMA number</label>
            <input value={form.rma_no} onChange={e => setForm(f => ({ ...f, rma_no: e.target.value }))} disabled={ncr.status === "closed"} />
          </>}

          <label>Corrective action</label>
          <textarea rows={3} value={form.corrective_action} onChange={e => setForm(f => ({ ...f, corrective_action: e.target.value }))} disabled={ncr.status === "closed"} />
        </div>

        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {ncr.status !== "closed" && (
            <button className="action-btn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          {canClose && (
            <button className="action-btn action-btn--danger" onClick={closeNcr} disabled={saving}>
              Close NCR
            </button>
          )}
          {msg && <span className="inline-msg">{msg}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Import helpers (exported for App.tsx wizard reuse) ────────────────────────
export function downloadCsvTemplate(filename: string, header: string) {
  const blob = new Blob([header + "\n"], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export const CSV_IMPORT_HEADERS = {
  customers: "account_code,name,address_line_1,address_line_2,postcode,telephone,email,website",
  suppliers: "account_code,name,address_line_1,address_line_2,postcode,telephone,email,website,is_subcontractor",
  "stock-items": "account_code,description_1,short_description,stock_unit_1,price_basis,nominal_price,weight_per_metre",
}

export type ImportCsvResult = { imported: number; errors: { row: number; error: string }[] } | null

export function ImportSection({ company, entity, label, header, compact }: {
  company: string
  entity: "customers" | "suppliers" | "stock-items"
  label: string
  header: string
  compact?: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportCsvResult>(null)
  const [loading, setLoading] = useState(false)

  async function upload() {
    if (!file) return
    setLoading(true); setResult(null)
    try { setResult(await api.importCsv(company, entity, file)) } finally { setLoading(false) }
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h4 style={{ marginBottom: ".4rem" }}>{label}</h4>
      <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className={compact ? "btn btn-sm btn-secondary" : "action-btn"}
          onClick={() => downloadCsvTemplate(`${entity}-template.csv`, header)}>
          Download template
        </button>
        <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className={compact ? "btn btn-sm" : "action-btn"} onClick={upload} disabled={!file || loading}>
          {loading ? "Uploading…" : "Upload"}
        </button>
      </div>
      {result && (
        <p style={{ marginTop: ".4rem", fontSize: ".85rem" }}>
          {result.imported} imported, {result.errors.length} errors
          {result.errors.length > 0 && (
            <span style={{ color: "var(--color-error, red)" }}>
              {" — "}{result.errors.slice(0, 3).map(e => `row ${e.row}: ${e.error}`).join("; ")}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

// ── Import View ───────────────────────────────────────────────────────────────
export function ImportView({ company }: { company: string }) {
  return (
    <div className="view-root">
      <h2>Import data</h2>
      <p style={{ marginBottom: "1.5rem", color: "var(--color-muted)" }}>
        Upload CSV files to bulk-import records. Download a template first to see the required column layout.
      </p>
      <ImportSection company={company} entity="customers" label="Customers" header={CSV_IMPORT_HEADERS.customers} />
      <ImportSection company={company} entity="suppliers" label="Suppliers" header={CSV_IMPORT_HEADERS.suppliers} />
      <ImportSection company={company} entity="stock-items" label="Stock items" header={CSV_IMPORT_HEADERS["stock-items"]} />
    </div>
  )
}
