import { useState, useCallback } from "react"
import { api, type ForwardContract, type CurrencyRate } from "../api"
import { useData, Shell, Badge, fmtDate } from "../views"

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

      <div className="table-wrap">
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
      </div>

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
