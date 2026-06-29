import { useState, useEffect } from "react"
import { api, type EdiPartner, type EdiTransaction } from "../api"
import { FileDrop, Badge } from "../views"

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
        await api.edi.createPartner(company, editPartner as Parameters<typeof api.edi.createPartner>[1])
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
          <FileDrop accept=".edi,.txt,.x12,.edifact" onChange={handleUpload} disabled={uploading} />
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
