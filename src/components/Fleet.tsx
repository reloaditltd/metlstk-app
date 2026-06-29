import { useState } from "react"
import { api, type Vehicle, type Driver } from "../api"
import { useData, Toolbar, Shell, Badge, fmtDate } from "../views"

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
