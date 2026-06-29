import { useState, useEffect, useRef } from "react"
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"
import * as XLSX from "xlsx"
import { api } from "../api"

type NavAction = { type: "navigate"; module: string; label: string }
type AssistChart = {
  type: "bar" | "line" | "pie"
  title: string
  x_key: string
  y_key: string
  data: Record<string, unknown>[]
}
type Msg = {
  role: "user" | "assistant"; content: string; actions?: NavAction[]; charts?: AssistChart[]
  streaming?: boolean; toolStatus?: string
}

const COLOURS = ["#1a73e8", "#34a853", "#fbbc04", "#ea4335", "#9334e6", "#00897b"]

// Friendly status lines shown while a tool runs. Keys are the backend tool names.
const TOOL_LABELS: Record<string, string> = {
  run_report: "Running report…",
  generate_chart: "Generating chart…",
  create_draft_sales_order: "Creating draft sales order…",
  create_quote: "Creating quote…",
  create_purchase_order: "Raising purchase order…",
  create_stock_code: "Creating stock code…",
  set_customer_salesperson: "Assigning salesperson…",
  allocate_stock: "Allocating stock…",
  book_in_stock: "Booking in stock…",
  navigate: "Finding screen…",
}

// Guided-creation modes — keys match the backend's WIZARD_ENTITIES.
const WIZARDS: Record<string, string> = {
  quote: "Quotation", po: "Purchase Order", "sales-order": "Sales Order",
  stock: "Stock Code", grn: "Goods-In (GRN)",
}

function exportToExcel(chart: AssistChart) {
  const ws = XLSX.utils.json_to_sheet(chart.data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, chart.title.slice(0, 31) || "Sheet1")
  XLSX.writeFile(wb, `${chart.title.replace(/[^a-z0-9]/gi, "_") || "chart"}.xlsx`)
}

function ChartBlock({ chart }: { chart: AssistChart }) {
  return (
    <div style={{ marginTop: 12, background: "#fafafa", borderRadius: 8, padding: "12px 8px" }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, textAlign: "center" }}>{chart.title}</div>
      <ResponsiveContainer width="100%" height={220}>
        {chart.type === "bar" ? (
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chart.x_key} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={chart.y_key} fill="#1a73e8" />
          </BarChart>
        ) : chart.type === "line" ? (
          <LineChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chart.x_key} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey={chart.y_key} stroke="#1a73e8" dot={false} />
          </LineChart>
        ) : (
          <PieChart>
            <Pie data={chart.data} dataKey={chart.y_key} nameKey={chart.x_key} cx="50%" cy="50%" outerRadius={80} label>
              {chart.data.map((_, i) => <Cell key={i} fill={COLOURS[i % COLOURS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        )}
      </ResponsiveContainer>
      <button onClick={() => exportToExcel(chart)}
        style={{ marginTop: 6, fontSize: 11, cursor: "pointer", background: "none", border: "1px solid #ccc", borderRadius: 4, padding: "2px 8px" }}>
        ⬇ Excel
      </button>
    </div>
  )
}

function loadHistory(company: string): Msg[] {
  try { return JSON.parse(sessionStorage.getItem(`assist_history_${company}`) || "[]") }
  catch { return [] }
}

// True if the text contains at least one real markdown table row (≥2 cells), not just a stray pipe.
function hasTableRow(text: string): boolean {
  return text.split("\n").some(l => {
    const t = l.trim()
    if (!/^\|.*\|$/.test(t)) return false
    return t.replace(/^\||\|$/g, "").split("|").length >= 2
  })
}

// Inline formatting: **bold** and `code`. Returns React nodes.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0, i = 0, m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith("**")) parts.push(<strong key={`${keyPrefix}-${i}`}>{tok.slice(2, -2)}</strong>)
    else parts.push(<code key={`${keyPrefix}-${i}`}>{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
    i++
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function renderTable(rows: string[], key: string): React.ReactNode {
  const cells = (r: string) => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim())
  const isSep = (r: string) => /^\|[\s:|-]+\|$/.test(r)  // markdown separator row
  const data = rows.filter(r => !isSep(r))
  if (!data.length) return null
  const head = cells(data[0])
  const body = data.slice(1).map(cells)
  return (
    <table key={key} className="assist-table">
      <thead><tr>{head.map((h, j) => <th key={j}>{renderInline(h, `${key}-h${j}`)}</th>)}</tr></thead>
      <tbody>{body.map((row, ri) => (
        <tr key={ri}>{row.map((c, ci) => <td key={ci}>{renderInline(c, `${key}-${ri}-${ci}`)}</td>)}</tr>
      ))}</tbody>
    </table>
  )
}

// Lightweight markdown: headings, tables, bold/code, blank-line paragraphs. No deps.
export function renderReply(text: string): React.ReactNode {
  const lines = text.split("\n")
  const blocks: React.ReactNode[] = []
  let para: string[] = []
  const flush = () => {
    if (!para.length) return
    const key = `p-${blocks.length}`
    blocks.push(<p key={key}>{renderInline(para.join(" "), key)}</p>)
    para = []
  }
  let i = 0
  while (i < lines.length) {
    const t = lines[i].trim()
    if (t === "") { flush(); i++; continue }
    if (/^#{1,2}\s/.test(t)) {
      flush()
      const key = `h-${blocks.length}`
      const content = t.replace(/^#{1,2}\s+/, "")
      blocks.push(t.startsWith("## ")
        ? <h4 key={key}>{renderInline(content, key)}</h4>
        : <h3 key={key}>{renderInline(content, key)}</h3>)
      i++; continue
    }
    if (/^\|.*\|$/.test(t)) {
      flush()
      const tbl: string[] = []
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { tbl.push(lines[i].trim()); i++ }
      blocks.push(renderTable(tbl, `t-${blocks.length}`))
      continue
    }
    para.push(t)
    i++
  }
  flush()
  return <>{blocks}</>
}

export function AssistPanel({ company, screen }: { company: string; screen: string }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>(() => loadHistory(company))
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [wizard, setWizard] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const loadedCo = useRef(company)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, busy])
  // Persist per-company history; rehydrate when the company changes.
  useEffect(() => {
    if (loadedCo.current !== company) { loadedCo.current = company; setMsgs(loadHistory(company)); return }
    try { sessionStorage.setItem(`assist_history_${company}`, JSON.stringify(msgs.slice(-50))) } catch { /* quota / private mode */ }
  }, [msgs, company])

  // textOverride/modeOverride let startWizard kick off a turn without waiting for state to settle.
  async function send(textOverride?: string, modeOverride?: string | null) {
    const text = (textOverride ?? input).trim()
    const mode = modeOverride !== undefined ? modeOverride : wizard
    if (!text || busy) return
    const history = msgs.map(m => ({ role: m.role, content: m.content }))
    setMsgs([...msgs,
      { role: "user", content: text },
      { role: "assistant", content: "", streaming: true }])
    setInput(""); setBusy(true)
    // Always patch the last (streaming) message — safe against stale state.
    const patchLast = (p: Partial<Msg>) =>
      setMsgs(cur => cur.map((m, i) => i === cur.length - 1 ? { ...m, ...p } : m))
    let acc = ""
    try {
      await api.assistStream(company, { message: text, history, screen, wizard_mode: mode ?? undefined }, {
        token: t => { acc += t; patchLast({ content: acc }) },
        toolStart: name => patchLast({ toolStatus: TOOL_LABELS[name] ?? "Working…" }),
        toolDone: () => patchLast({ toolStatus: undefined }),
        done: r => patchLast({ content: r.reply || acc, actions: r.actions, charts: r.charts, streaming: false, toolStatus: undefined }),
        error: e => patchLast({ content: "Sorry — " + e, streaming: false, toolStatus: undefined }),
      })
    } catch (e) {
      patchLast({ content: "Sorry — " + String(e), streaming: false, toolStatus: undefined })
    } finally { setBusy(false) }
  }

  function startWizard(mode: string) {
    setWizard(mode)
    send(`Help me create ${mode === "grn" ? "a goods-in (GRN) booking" : "a " + WIZARDS[mode].toLowerCase()}.`, mode)
  }

  if (!open) return <button className="assist-fab" onClick={() => setOpen(true)}>✦ Assistant</button>
  return (
    <div className="assist-panel assist-panel-print">
      <div className="assist-head"><strong>✦ MetlStk Assistant</strong>
        <span style={{ flex: 1 }} />
        <button onClick={() => window.print()}
          style={{ fontSize: 11, cursor: "pointer", background: "none", border: "1px solid rgba(255,255,255,0.5)", color: "#fff", borderRadius: 4, padding: "2px 8px", marginRight: 8 }}>
          ⬇ PDF
        </button>
        <button className="modal-close" aria-label="Close" style={{ color: "#fff" }} onClick={() => setOpen(false)}>×</button></div>
      {wizard && <div className="assist-wizard-strip">
        Creating: <strong>{WIZARDS[wizard]}</strong>
        <button onClick={() => setWizard(null)} disabled={busy}>✕ Exit</button>
      </div>}
      <div className="assist-msgs">
        {msgs.length === 0 && <div className="assist-hint">
          Ask me for any report (stock, sales, customers, margins, what needs attention) — or let me
          handle the admin: create a stock code, raise a purchase order, assign a salesperson. I'll
          always confirm the details before making any change.
        </div>}
        {msgs.map((m, i) => {
          // Wizard confirmation prompt: a table summary + a "confirm/shall I" question → offer one-click actions.
          const isConfirmation = m.role === "assistant" && !m.streaming && !!wizard &&
            hasTableRow(m.content) && /confirm|shall i/i.test(m.content)
          return <div key={i} className={`assist-msg ${m.role}`}>
            {m.role === "assistant"
              ? (m.streaming && !m.content ? "…" : renderReply(m.content))
              : m.content}
            {m.toolStatus && (
              <div style={{ fontSize: 11, color: "#888", fontStyle: "italic", marginTop: 4 }}>
                {m.toolStatus}
              </div>
            )}
            {m.actions?.map((action, j) => (
              <button key={j} onClick={() => { window.location.hash = `#/${company}/${action.module}` }}
                style={{ display: "inline-block", marginTop: "8px", marginRight: "6px", padding: "6px 12px",
                  background: "#1a73e8", color: "white", border: "none", borderRadius: "4px",
                  cursor: "pointer", fontSize: "13px" }}>
                {action.label}
              </button>
            ))}
            {isConfirmation && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => send("Confirm, create it")}
                  style={{ background: "#34a853", color: "white", border: "none", borderRadius: 4, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  ✓ Confirm &amp; Create
                </button>
                <button onClick={() => { setWizard(null); send("Cancel", null) }}
                  style={{ background: "#ea4335", color: "white", border: "none", borderRadius: 4, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  ✗ Cancel
                </button>
              </div>
            )}
            {m.charts?.map((chart, j) => <ChartBlock key={j} chart={chart} />)}
          </div>
        })}
        <div ref={endRef} />
      </div>
      <div className="assist-input">
        <textarea value={input} placeholder="Ask the assistant…" onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <select className="assist-wizard-pick" value="" disabled={busy} title="Guided creation"
            onChange={e => { if (e.target.value) startWizard(e.target.value) }}>
            <option value="">✦ Guide me…</option>
            {Object.entries(WIZARDS).map(([k, v]) => <option key={k} value={k}>New {v}</option>)}
          </select>
          <button className="action-btn" disabled={busy} onClick={() => send()}>Send</button>
        </div>
      </div>
    </div>
  )
}
