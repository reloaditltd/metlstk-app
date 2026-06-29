import { useState, useEffect, useRef } from "react"
import { api } from "../api"

type NavAction = { type: "navigate"; module: string; label: string }
type Msg = { role: "user" | "assistant"; content: string; actions?: NavAction[] }

function loadHistory(company: string): Msg[] {
  try { return JSON.parse(sessionStorage.getItem(`assist_history_${company}`) || "[]") }
  catch { return [] }
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
  const endRef = useRef<HTMLDivElement>(null)
  const loadedCo = useRef(company)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, busy])
  // Persist per-company history; rehydrate when the company changes.
  useEffect(() => {
    if (loadedCo.current !== company) { loadedCo.current = company; setMsgs(loadHistory(company)); return }
    try { sessionStorage.setItem(`assist_history_${company}`, JSON.stringify(msgs)) } catch { /* quota / private mode */ }
  }, [msgs, company])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...msgs, { role: "user" as const, content: text }]
    setMsgs(next); setInput(""); setBusy(true)
    try {
      const r = await api.assist(company, next, screen)
      setMsgs([...next, { role: "assistant", content: r.reply, actions: r.actions }])
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
        {msgs.map((m, i) => <div key={i} className={`assist-msg ${m.role}`}>
          {m.role === "assistant" ? renderReply(m.content) : m.content}
          {m.actions?.map((action, j) => (
            <button key={j} onClick={() => { window.location.hash = `#/${company}/${action.module}` }}
              style={{ display: "inline-block", marginTop: "8px", marginRight: "6px", padding: "6px 12px",
                background: "#1a73e8", color: "white", border: "none", borderRadius: "4px",
                cursor: "pointer", fontSize: "13px" }}>
              {action.label}
            </button>
          ))}
        </div>)}
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
