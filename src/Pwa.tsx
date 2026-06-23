import { useState, useEffect, useRef, useCallback } from "react"
import { api } from "./api"
import type { ShopFloorWo, DowntimeRecord, SfEventIn } from "./api"
import { supabase } from "./supabase"

// ─── constants ───────────────────────────────────────────────────────────────
const PIN_KEY = "sf_pin"
const OP_KEY  = "sf_operator"
const Q_KEY   = "sf_queue"
const SESSION_HOURS = 8

const REASON_CODES = [
  { code: "blade_change",         label: "Blade Change" },
  { code: "breakdown",            label: "Breakdown" },
  { code: "material_wait",        label: "Material Wait" },
  { code: "quality_hold",         label: "Quality Hold" },
  { code: "planned_maintenance",  label: "Planned Maint." },
  { code: "other",                label: "Other" },
]

// ─── offline queue ────────────────────────────────────────────────────────────
function queueEvent(e: SfEventIn) {
  const q: SfEventIn[] = JSON.parse(localStorage.getItem(Q_KEY) || "[]")
  q.push({ ...e, event_at: e.event_at ?? new Date().toISOString() })
  localStorage.setItem(Q_KEY, JSON.stringify(q))
}

async function flushQueue(company: string) {
  const q: SfEventIn[] = JSON.parse(localStorage.getItem(Q_KEY) || "[]")
  if (!q.length) return
  try {
    await api.shopFloor.logEvents(company, q)
    localStorage.removeItem(Q_KEY)
  } catch { /* stay offline */ }
}

// ─── photo upload ─────────────────────────────────────────────────────────────
async function uploadPhoto(file: File): Promise<string | null> {
  const path = `shop-floor/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    contentType: file.type, upsert: false,
  })
  return error ? null : path
}

// ─── styles ───────────────────────────────────────────────────────────────────
const S = {
  shell: {
    position: "fixed" as const, inset: 0,
    background: "#111", color: "#fff",
    fontFamily: "system-ui, sans-serif",
    display: "flex", flexDirection: "column" as const,
    userSelect: "none" as const,
    WebkitUserSelect: "none" as const,
  },
  header: {
    padding: "12px 16px", background: "#1a1a1a",
    borderBottom: "1px solid #333",
    display: "flex", alignItems: "center", gap: 12,
    minHeight: 56,
  },
  main: { flex: 1, overflowY: "auto" as const, padding: 12 },
  btn: (color = "#f97316") => ({
    background: color, color: "#fff",
    border: "none", borderRadius: 12,
    fontSize: 18, fontWeight: 700,
    padding: "0 20px",
    minHeight: 60, minWidth: 60,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", width: "100%",
    WebkitTapHighlightColor: "transparent",
  }),
  btnSm: (color = "#333") => ({
    background: color, color: "#fff",
    border: "none", borderRadius: 10,
    fontSize: 15, fontWeight: 600,
    padding: "0 16px", minHeight: 48,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  }),
  tile: (color: string) => ({
    background: color, color: "#fff",
    borderRadius: 16, padding: 24,
    fontSize: 20, fontWeight: 700,
    minHeight: 100,
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center", gap: 8,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  }),
  card: {
    background: "#1e1e1e", borderRadius: 12,
    padding: 16, marginBottom: 10,
  },
  input: {
    width: "100%", background: "#222", color: "#fff",
    border: "1px solid #444", borderRadius: 10,
    fontSize: 18, padding: "12px 14px",
    outline: "none", boxSizing: "border-box" as const,
  },
  label: { fontSize: 13, color: "#aaa", marginBottom: 4, display: "block" },
  row: { display: "flex", gap: 10, marginBottom: 10 },
  badge: (c: string) => ({
    background: c, color: "#fff", borderRadius: 8,
    fontSize: 12, fontWeight: 700, padding: "2px 8px",
  }),
}

type Screen = "menu" | "wo-list" | "wo-detail" | "picking" | "grn" | "downtime"

// ─── PIN screen ───────────────────────────────────────────────────────────────
function PinScreen({ onUnlock }: { onUnlock: () => void }) {
  const [stored] = useState(() => localStorage.getItem(PIN_KEY) || "")
  const [digits, setDigits] = useState("")
  const [err, setErr] = useState("")
  const [setting] = useState(!stored)

  const press = (d: string) => setDigits(p => p.length < 4 ? p + d : p)
  const back  = () => setDigits(p => p.slice(0, -1))

  const submit = () => {
    if (digits.length < 4) return
    if (setting) {
      localStorage.setItem(PIN_KEY, digits)
      localStorage.setItem(PIN_KEY + "_ts", Date.now().toString())
      onUnlock()
    } else {
      if (digits === stored) {
        localStorage.setItem(PIN_KEY + "_ts", Date.now().toString())
        onUnlock()
      } else {
        setErr("Wrong PIN"); setDigits("")
      }
    }
  }

  const KEYS = [["1","2","3"],["4","5","6"],["7","8","9"],["←","0","OK"]]

  return (
    <div style={{ ...S.shell, alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>
        {setting ? "Set PIN" : "Shop Floor"}
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 22, height: 22, borderRadius: "50%",
            background: digits.length > i ? "#f97316" : "#444",
            transition: "background 0.1s",
          }} />
        ))}
      </div>
      {err && <div style={{ color: "#f87171", marginBottom: 12 }}>{err}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 80px)", gap: 12 }}>
        {KEYS.flat().map(k => (
          <button key={k} onClick={() => k === "←" ? back() : k === "OK" ? submit() : press(k)}
            style={{
              ...S.btn(k === "OK" ? "#22c55e" : k === "←" ? "#555" : "#2a2a2a"),
              minHeight: 72, fontSize: 24,
            }}>
            {k}
          </button>
        ))}
      </div>
      {setting && <div style={{ color: "#aaa", fontSize: 13, marginTop: 16, textAlign: "center" }}>
        Set a 4-digit PIN for this device
      </div>}
    </div>
  )
}

// ─── operator name bar ────────────────────────────────────────────────────────
function OpBar({ op, onChange }: { op: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(!op)
  const [val, setVal] = useState(op)
  if (editing) return (
    <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: "#1a1a1a", borderBottom: "1px solid #333" }}>
      <input style={{ ...S.input, fontSize: 15, padding: "8px 12px" }}
        placeholder="Your name / initials"
        value={val} autoFocus
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && val.trim()) { onChange(val.trim()); setEditing(false) } }} />
      <button style={S.btnSm("#22c55e")} onClick={() => { if (val.trim()) { onChange(val.trim()); setEditing(false) } }}>OK</button>
    </div>
  )
  return (
    <div style={{ padding: "6px 16px", background: "#1a1a1a", borderBottom: "1px solid #333", fontSize: 13, color: "#aaa" }}
      onClick={() => setEditing(true)}>
      Operator: <strong style={{ color: "#fff" }}>{op}</strong> <span style={{ color: "#666" }}>· tap to change</span>
    </div>
  )
}

// ─── works orders ─────────────────────────────────────────────────────────────
function WoList({ company, onSelect }: { company: string; onSelect: (wo: ShopFloorWo) => void }) {
  const [wos, setWos] = useState<ShopFloorWo[]>([])
  const [status, setStatus] = useState("open")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.shopFloor.wos(company, status).then(setWos).finally(() => setLoading(false))
  }, [company, status])

  const STATUS_COLORS: Record<string, string> = { open: "#3b82f6", in_progress: "#f97316", completed: "#22c55e" }

  return (
    <div>
      <div style={{ ...S.row, marginBottom: 12 }}>
        {["open","in_progress","completed"].map(s => (
          <button key={s} style={S.btnSm(status === s ? "#f97316" : "#333")}
            onClick={() => setStatus(s)}>
            {s.replace("_"," ")}
          </button>
        ))}
      </div>
      {loading && <p style={{ color: "#aaa" }}>Loading…</p>}
      {!loading && !wos.length && <p style={{ color: "#aaa" }}>No {status.replace("_"," ")} works orders</p>}
      {wos.map(wo => (
        <div key={wo.wo_no} style={{ ...S.card, cursor: "pointer" }} onClick={() => onSelect(wo)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong style={{ fontSize: 18 }}>{wo.wo_no}</strong>
            <span style={S.badge(STATUS_COLORS[wo.status] ?? "#555")}>{wo.status}</span>
          </div>
          <div style={{ color: "#ccc", fontSize: 14 }}>
            {wo.grade} {wo.spec} · {wo.parent_batch_no}
            {wo.length_mm ? ` · ${Number(wo.length_mm).toLocaleString()}mm` : ""}
          </div>
          <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>{wo.operation_type}</div>
        </div>
      ))}
    </div>
  )
}

function WoDetail({ company, wo, operator, onBack }: {
  company: string; wo: ShopFloorWo; operator: string; onBack: () => void
}) {
  const [detail, setDetail] = useState<ShopFloorWo>(wo)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  const reload = () => api.shopFloor.wo(company, wo.wo_no).then(setDetail)

  const action = async (eventType: string, apiStatus?: string) => {
    setBusy(true); setMsg("")
    try {
      queueEvent({ event_type: eventType, wo_no: wo.wo_no, operator })
      await flushQueue(company)
      if (apiStatus) await api.workOrders.setStatus(company, wo.wo_no, apiStatus)
      await reload()
      setMsg(`${eventType.replace("wo_", "").toUpperCase()} recorded`)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error")
    } finally { setBusy(false) }
  }

  const st = detail.status

  return (
    <div>
      <button style={{ ...S.btnSm(), marginBottom: 12, width: "auto" }} onClick={onBack}>← Back</button>
      <div style={S.card}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{detail.wo_no}</div>
        <div style={{ color: "#ccc" }}>{detail.grade} · {detail.spec}</div>
        <div style={{ color: "#ccc" }}>Batch: {detail.parent_batch_no}</div>
        {detail.length_mm && <div style={{ color: "#ccc" }}>Length: {Number(detail.length_mm).toLocaleString()}mm</div>}
        {detail.cutting_list?.length ? (
          <div style={{ marginTop: 8, fontSize: 13, color: "#aaa" }}>
            Cuts: {detail.cutting_list.map(c => `${c.qty}×${c.length_mm}mm`).join(", ")}
          </div>
        ) : null}
      </div>

      <div style={{ ...S.row, flexDirection: "column", gap: 10 }}>
        {st === "open" && (
          <button style={S.btn("#3b82f6")} disabled={busy} onClick={() => action("wo_start", "in_progress")}>
            ▶ Start
          </button>
        )}
        {st === "in_progress" && <>
          <button style={S.btn("#f59e0b")} disabled={busy} onClick={() => action("wo_pause", "on_hold")}>
            ⏸ Pause
          </button>
          <button style={S.btn("#22c55e")} disabled={busy} onClick={() => action("wo_complete", "complete")}>
            ✓ Complete
          </button>
        </>}
        {st === "on_hold" && (
          <button style={S.btn("#3b82f6")} disabled={busy} onClick={() => action("wo_resume", "in_progress")}>
            ▶ Resume
          </button>
        )}
      </div>

      {msg && <div style={{ color: "#22c55e", marginTop: 10, textAlign: "center" }}>{msg}</div>}

      {detail.events?.length ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: "#aaa", fontSize: 13, marginBottom: 6 }}>Events</div>
          {detail.events.map((ev, i) => (
            <div key={i} style={{ ...S.card, padding: "10px 12px", marginBottom: 6 }}>
              <span style={{ color: "#f97316", fontWeight: 700 }}>{ev.event_type}</span>
              <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>
                {new Date(ev.event_at).toLocaleTimeString()} · {ev.operator}
              </span>
              {ev.notes && <div style={{ color: "#ccc", fontSize: 13 }}>{ev.notes}</div>}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── picking screen ───────────────────────────────────────────────────────────
function PickingScreen({ company, operator }: { company: string; operator: string }) {
  const [batchNo, setBatchNo] = useState("")
  const [dnNo, setDnNo] = useState("")
  const [notes, setNotes] = useState("")
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = await uploadPhoto(file)
    setPhotoPath(path)
    setUploading(false)
  }

  const confirm = async () => {
    if (!batchNo.trim() && !dnNo.trim()) { setMsg("Enter batch or DN number"); return }
    queueEvent({
      event_type: "pick_confirm",
      batch_no: batchNo.trim() || undefined,
      dn_no: dnNo.trim() || undefined,
      operator, notes: notes.trim() || undefined,
      photo_path: photoPath || undefined,
    })
    await flushQueue(company)
    setMsg("Confirmed ✓"); setBatchNo(""); setDnNo(""); setNotes(""); setPhotoPath(null)
  }

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Delivery Note No.</label>
        <input style={S.input} value={dnNo} placeholder="DN-00123"
          onChange={e => setDnNo(e.target.value)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Batch / Barcode</label>
        <input style={S.input} value={batchNo} placeholder="Scan or type batch no."
          onChange={e => setBatchNo(e.target.value)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Notes / exception</label>
        <input style={S.input} value={notes} placeholder="Optional"
          onChange={e => setNotes(e.target.value)} />
      </div>
      <button style={{ ...S.btn("#555"), marginBottom: 10 }}
        onClick={() => fileRef.current?.click()}>
        {uploading ? "Uploading…" : photoPath ? "Photo ✓ (retake)" : "📷 Take Photo"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }} onChange={handlePhoto} />
      <button style={S.btn()} onClick={confirm}>Confirm Pick</button>
      {msg && <div style={{ color: "#22c55e", marginTop: 10, textAlign: "center" }}>{msg}</div>}
    </div>
  )
}

// ─── GRN / goods-in screen ────────────────────────────────────────────────────
function GrnScreen({ company, operator }: { company: string; operator: string }) {
  const [dnNo, setDnNo] = useState("")
  const [qty, setQty] = useState("")
  const [weight, setWeight] = useState("")
  const [heatNo, setHeatNo] = useState("")
  const [notes, setNotes] = useState("")
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = await uploadPhoto(file)
    setPhotoPath(path)
    setUploading(false)
  }

  const submit = async () => {
    if (!dnNo.trim()) { setMsg("Enter delivery note number"); return }
    queueEvent({
      event_type: "grn_scan", dn_no: dnNo.trim(), operator,
      qty: qty ? parseFloat(qty) : undefined,
      unit: weight ? "kg" : undefined,
      batch_no: heatNo.trim() || undefined,
      notes: [notes.trim(), weight ? `Weight: ${weight}kg` : ""].filter(Boolean).join("; ") || undefined,
      photo_path: photoPath || undefined,
    })
    await flushQueue(company)
    setMsg("GRN recorded ✓")
    setDnNo(""); setQty(""); setWeight(""); setHeatNo(""); setNotes(""); setPhotoPath(null)
  }

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Delivery Note / DN Ref</label>
        <input style={S.input} value={dnNo} placeholder="Scan or type DN"
          onChange={e => setDnNo(e.target.value)} />
      </div>
      <div style={S.row}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Qty received</label>
          <input style={S.input} type="number" inputMode="decimal" value={qty} placeholder="0"
            onChange={e => setQty(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Actual weight (kg)</label>
          <input style={S.input} type="number" inputMode="decimal" value={weight} placeholder="0"
            onChange={e => setWeight(e.target.value)} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Heat No. / Cast No.</label>
        <input style={S.input} value={heatNo} placeholder="Scan or type heat number"
          onChange={e => setHeatNo(e.target.value)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Notes / condition</label>
        <input style={S.input} value={notes} placeholder="Optional"
          onChange={e => setNotes(e.target.value)} />
      </div>
      <button style={{ ...S.btn("#555"), marginBottom: 10 }}
        onClick={() => fileRef.current?.click()}>
        {uploading ? "Uploading…" : photoPath ? "Photo ✓ (retake)" : "📷 Photo (label/heat stamp)"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }} onChange={handlePhoto} />
      <button style={S.btn()} onClick={submit}>Record Goods-In</button>
      {msg && <div style={{ color: "#22c55e", marginTop: 10, textAlign: "center" }}>{msg}</div>}
    </div>
  )
}

// ─── downtime screen ──────────────────────────────────────────────────────────
function DowntimeScreen({ company, operator }: { company: string; operator: string }) {
  const [active, setActive] = useState<DowntimeRecord[]>([])
  const [reason, setReason] = useState("breakdown")
  const [woNo, setWoNo] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")

  const reload = useCallback(() => {
    api.shopFloor.downtime(company, true).then(setActive)
  }, [company])

  useEffect(() => { reload() }, [reload])

  const start = async () => {
    setBusy(true)
    try {
      await api.shopFloor.startDowntime(company, {
        reason_code: reason, wo_no: woNo.trim() || undefined,
        operator, notes: notes.trim() || undefined,
      })
      queueEvent({ event_type: "downtime_start", wo_no: woNo.trim() || undefined, operator, notes: reason })
      setMsg("Downtime started"); setWoNo(""); setNotes("")
      reload()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error") }
    finally { setBusy(false) }
  }

  const end = async (id: number) => {
    setBusy(true)
    try {
      await api.shopFloor.endDowntime(company, id)
      queueEvent({ event_type: "downtime_end", operator })
      setMsg("Downtime ended")
      reload()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Error") }
    finally { setBusy(false) }
  }

  return (
    <div>
      {active.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#f87171", fontWeight: 700, marginBottom: 8 }}>Active downtime</div>
          {active.map(dt => (
            <div key={dt.id} style={{ ...S.card, borderLeft: "3px solid #f87171" }}>
              <div style={{ fontWeight: 700 }}>{REASON_CODES.find(r => r.code === dt.reason_code)?.label ?? dt.reason_code}</div>
              <div style={{ color: "#aaa", fontSize: 13 }}>
                Started: {new Date(dt.started_at).toLocaleTimeString()}
                {dt.wo_no ? ` · WO ${dt.wo_no}` : ""}
                {dt.operator ? ` · ${dt.operator}` : ""}
              </div>
              <button style={{ ...S.btn("#22c55e"), marginTop: 10 }} disabled={busy} onClick={() => end(dt.id)}>
                ✓ End Downtime
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ color: "#aaa", fontSize: 14, marginBottom: 10 }}>Start new downtime</div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Reason</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {REASON_CODES.map(r => (
            <button key={r.code} style={S.btnSm(reason === r.code ? "#f97316" : "#333")}
              onClick={() => setReason(r.code)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>WO No. (optional)</label>
        <input style={S.input} value={woNo} placeholder="WO000001"
          onChange={e => setWoNo(e.target.value)} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Notes</label>
        <input style={S.input} value={notes} placeholder="Optional"
          onChange={e => setNotes(e.target.value)} />
      </div>
      <button style={S.btn("#f87171")} disabled={busy} onClick={start}>Start Downtime</button>
      {msg && <div style={{ color: "#22c55e", marginTop: 10, textAlign: "center" }}>{msg}</div>}
    </div>
  )
}

// ─── main PWA shell ───────────────────────────────────────────────────────────
export default function PwaShell({ company }: { company: string }) {
  const [unlocked, setUnlocked] = useState(() => {
    const ts = Number(localStorage.getItem(PIN_KEY + "_ts") || 0)
    const pin = localStorage.getItem(PIN_KEY)
    return !!pin && Date.now() - ts < SESSION_HOURS * 3600 * 1000
  })
  const [operator, setOperator] = useState(() => localStorage.getItem(OP_KEY) || "")
  const [screen, setScreen] = useState<Screen>("menu")
  const [selectedWo, setSelectedWo] = useState<ShopFloorWo | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const wakeLock = useRef<WakeLockSentinel | null>(null)

  // Wake lock (Android Chrome only)
  useEffect(() => {
    if (!("wakeLock" in navigator)) return
    const acquire = () =>
      (navigator as Navigator & { wakeLock: { request(t: string): Promise<WakeLockSentinel> } })
        .wakeLock.request("screen").then(l => { wakeLock.current = l }).catch(() => {})
    acquire()
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") acquire() })
  }, [])

  // Online/offline + flush
  useEffect(() => {
    const on  = () => { setOnline(true);  flushQueue(company) }
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    flushQueue(company)
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
  }, [company])

  const setOp = (v: string) => { localStorage.setItem(OP_KEY, v); setOperator(v) }

  if (!unlocked) return <PinScreen onUnlock={() => setUnlocked(true)} />

  const MENU_TILES = [
    { id: "wo-list",  label: "Works Orders", icon: "⚙️",  color: "#3b82f6" },
    { id: "picking",  label: "Picking",       icon: "📦",  color: "#8b5cf6" },
    { id: "grn",      label: "Goods-In",      icon: "🚚",  color: "#059669" },
    { id: "downtime", label: "Downtime",       icon: "🔴",  color: "#dc2626" },
  ] as const

  const TITLES: Record<Screen, string> = {
    menu: "Shop Floor", "wo-list": "Works Orders", "wo-detail": "WO Detail",
    picking: "Picking", grn: "Goods-In", downtime: "Downtime",
  }

  return (
    <div style={S.shell}>
      <div style={S.header}>
        {screen !== "menu" && (
          <button style={{ ...S.btnSm(), padding: "0 12px", minWidth: 44, fontSize: 22 }}
            onClick={() => { if (screen === "wo-detail") setScreen("wo-list"); else setScreen("menu") }}>
            ←
          </button>
        )}
        <span style={{ fontWeight: 700, fontSize: 18, flex: 1 }}>{TITLES[screen]}</span>
        <span style={{ fontSize: 11, color: online ? "#22c55e" : "#f87171" }}>
          {online ? "● online" : "● offline"}
        </span>
      </div>

      <OpBar op={operator} onChange={setOp} />

      <div style={S.main}>
        {screen === "menu" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, paddingTop: 8 }}>
            {MENU_TILES.map(t => (
              <div key={t.id} style={S.tile(t.color)}
                onClick={() => setScreen(t.id as Screen)}>
                <span style={{ fontSize: 36 }}>{t.icon}</span>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        )}
        {screen === "wo-list" && (
          <WoList company={company} onSelect={wo => { setSelectedWo(wo); setScreen("wo-detail") }} />
        )}
        {screen === "wo-detail" && selectedWo && (
          <WoDetail company={company} wo={selectedWo} operator={operator}
            onBack={() => setScreen("wo-list")} />
        )}
        {screen === "picking"  && <PickingScreen  company={company} operator={operator} />}
        {screen === "grn"      && <GrnScreen      company={company} operator={operator} />}
        {screen === "downtime" && <DowntimeScreen company={company} operator={operator} />}
      </div>
    </div>
  )
}
