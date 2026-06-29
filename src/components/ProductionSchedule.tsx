import { useState, useEffect } from "react"
import {
  api,
  type MachineRow, type ScheduleEntry, type BookedSlot, type UnscheduledWO,
} from "../api"

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
