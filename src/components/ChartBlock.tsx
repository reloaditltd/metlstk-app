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

// xlsx is loaded on demand (button click) so it stays out of the main bundle.
async function exportToExcel(chart: AssistChart) {
  const XLSX = await import("xlsx")
  const ws = XLSX.utils.json_to_sheet(chart.data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, chart.title.slice(0, 31) || "Sheet1")
  XLSX.writeFile(wb, `${chart.title.replace(/[^a-z0-9]/gi, "_") || "chart"}.xlsx`)
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
      <button onClick={() => exportToExcel(chart)}
        style={{ marginTop: 6, fontSize: 11, cursor: "pointer", background: "none", border: "1px solid #ccc", borderRadius: 4, padding: "2px 8px" }}>
        ⬇ Excel
      </button>
    </div>
  )
}
