import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"

export type AssistChart = {
  type: "bar" | "line" | "pie"
  title: string
  x_key: string
  y_key: string
  data: Record<string, unknown>[]
}

const COLOURS = ["#1a73e8", "#34a853", "#fbbc04", "#ea4335", "#9334e6", "#00897b"]

// Export flat chart data as CSV (zero-dependency, opens in Excel/Sheets). Replaces
// the abandoned `xlsx` package (2 HIGH CVEs); this data is a plain array of rows so
// CSV is sufficient and drops the vulnerable dependency entirely.
function exportCsv(chart: AssistChart) {
  const rows = chart.data
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\r\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })  // BOM = Excel-friendly UTF-8
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${chart.title.replace(/[^a-z0-9]/gi, "_") || "chart"}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ChartBlock({ chart }: { chart: AssistChart }) {
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
      <button onClick={() => exportCsv(chart)}
        style={{ marginTop: 6, fontSize: 11, cursor: "pointer", background: "none", border: "1px solid #ccc", borderRadius: 4, padding: "2px 8px" }}>
        ⬇ CSV
      </button>
    </div>
  )
}
