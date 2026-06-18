import { useState, useEffect, useCallback } from "react"
import {
  api,
  type Customer, type CustomerDetail,
  type PurchaseOrder, type PurchaseOrderDetail, type PurchaseOrderLine,
  type SalesOrder, type SalesOrderDetail, type SalesOrderLine,
  type Invoice, type InvoiceDetail,
  type StockItem, type StockItemDetail,
  type StockBatch,
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

function Badge({ value }: { value: string | null }) {
  if (!value) return <span className="badge">—</span>
  const cls = value.toLowerCase().replace(/[^a-z]/g, "")
  return <span className={`badge badge-${cls}`}>{value}</span>
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
  if (loading) return <p className="state-msg">Loading…</p>
  if (error) return <p className="state-err">{error}</p>
  return <>{children}</>
}

// ── Customers ────────────────────────────────────────────────────────────────

export function CustomerList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q])
  const limit = 50
  const { data, loading, error } = useData<Customer[]>(
    () => api.customers.list(company, limit, offset, q),
    [company, limit, offset, q],
  )
  return (
    <Shell loading={loading} error={error}>
      <SearchBar value={search} onChange={setSearch} />
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
            <tr key={c.account_code}>
              <td><a href={`#/${company}/customers/${encodeURIComponent(c.account_code)}`}><code>{c.account_code}</code></a></td>
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
    </Shell>
  )
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export function PurchaseOrderList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q])
  const limit = 50
  const { data, loading, error } = useData<PurchaseOrder[]>(
    () => api.purchases.listOrders(company, limit, offset, q),
    [company, limit, offset, q],
  )
  return (
    <Shell loading={loading} error={error}>
      <SearchBar value={search} onChange={setSearch} />
      <table>
        <thead>
          <tr>
            <th>Order No</th><th>Supplier</th><th>Ref</th>
            <th>Order Date</th><th>Deliver By</th>
            <th className="r">Net</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.map(o => (
            <tr key={o.order_no}>
              <td><a href={`#/${company}/purchase-orders/${encodeURIComponent(o.order_no)}`}><code>{o.order_no}</code></a></td>
              <td>{o.supplier_name || o.supplier_account}</td>
              <td>{o.supplier_ref || "—"}</td>
              <td>{fmtDate(o.order_date)}</td>
              <td>{fmtDate(o.deliver_by)}</td>
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

// ── Sales Orders ──────────────────────────────────────────────────────────────

export function SalesOrderList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q])
  const limit = 50
  const { data, loading, error } = useData<SalesOrder[]>(
    () => api.sales.listOrders(company, limit, offset, q),
    [company, limit, offset, q],
  )
  return (
    <Shell loading={loading} error={error}>
      <SearchBar value={search} onChange={setSearch} />
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
              <td>{o.customer_name || o.customer_account}</td>
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
  const [offset, setOffset] = useState(0)
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q])
  const limit = 50
  const { data, loading, error } = useData<Invoice[]>(
    () => api.sales.listInvoices(company, limit, offset, q),
    [company, limit, offset, q],
  )
  return (
    <Shell loading={loading} error={error}>
      <SearchBar value={search} onChange={setSearch} />
      <table>
        <thead>
          <tr>
            <th>Invoice No</th><th>Customer</th><th>Date</th>
            <th className="r">Net</th><th className="r">VAT</th><th className="r">Total</th>
            <th>Posted</th>
          </tr>
        </thead>
        <tbody>
          {data?.map(i => (
            <tr key={i.doc_no}>
              <td><a href={`#/${company}/invoices/${encodeURIComponent(i.doc_no)}`}><code>{i.doc_no}</code></a></td>
              <td>{i.customer_name || i.customer_account}</td>
              <td>{fmtDate(i.invoice_date)}</td>
              <td className="r">{fmtGbp(i.net_gbp)}</td>
              <td className="r">{fmtGbp(i.vat_gbp)}</td>
              <td className="r">{fmtGbp(i.total_gbp)}</td>
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

export function StockList({ company }: { company: string }) {
  const [search, setSearch] = useState("")
  const [offset, setOffset] = useState(0)
  const q = useDebounce(search, 300)
  useEffect(() => setOffset(0), [q])
  const limit = 50
  const { data, loading, error } = useData<StockItem[]>(
    () => api.stock.list(company, limit, offset, q),
    [company, limit, offset, q],
  )
  return (
    <Shell loading={loading} error={error}>
      <SearchBar value={search} onChange={setSearch} />
      <table>
        <thead>
          <tr>
            <th>Code</th><th>Description</th><th>Grade</th>
            <th>Unit</th><th className="r">In Stock</th><th className="r">Free</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.map(s => (
            <tr key={s.account_code}>
              <td><a href={`#/${company}/stock/${encodeURIComponent(s.account_code)}`}><code>{s.account_code}</code></a></td>
              <td>{s.description_1 || s.short_description || "—"}</td>
              <td>{[s.attribute_1, s.attribute_2].filter(Boolean).join(" / ") || "—"}</td>
              <td>{s.stock_unit_1 || "—"}</td>
              <td className="r">{s.stock_qty}</td>
              <td className="r">{s.free_stock}</td>
              <td><Badge value={s.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && <Pager offset={offset} count={data.length} limit={limit} onChange={setOffset} />}
    </Shell>
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

export function CustomerDetail({ company, id }: { company: string; id: string }) {
  const { data: c, loading, error } = useData<CustomerDetail>(
    () => api.customers.get(company, id), [company, id]
  )
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
            <h3>Financials</h3>
            <dl>
              <dt>Credit Limit</dt><dd>{fmtGbp(c.credit_limit_gbp)}</dd>
              <dt>Balance</dt><dd>{fmtGbp(c.current_balance_gbp)}</dd>
              <dt>SO Balance</dt><dd>{fmtGbp(c.sales_order_balance_gbp)}</dd>
              <dt>Invoice Balance</dt><dd>{fmtGbp(c.invoice_balance_gbp)}</dd>
              <dt>Sales MTD</dt><dd>{fmtGbp(c.sales_mtd_gbp)}</dd>
              <dt>Sales YTD</dt><dd>{fmtGbp(c.sales_ytd_gbp)}</dd>
              <dt>Sales Last Year</dt><dd>{fmtGbp(c.sales_last_year_gbp)}</dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Account</h3>
            <dl>
              <dt>Code</dt><dd><code>{c.account_code}</code></dd>
              <dt>Status</dt><dd><Badge value={c.on_hold ? "Hold" : "Active"} /></dd>
              {c.hold_reason && [<dt key="hr-k">Hold Reason</dt>, <dd key="hr-v">{c.hold_reason}</dd>]}
              <dt>Terms</dt><dd>{c.terms || "—"}</dd>
              <dt>Pay Days</dt><dd>{c.payment_due_days ?? "—"}</dd>
              <dt>VAT Code</dt><dd>{c.vat_code || "—"}</dd>
              <dt>Currency</dt><dd>{c.currency || "—"}</dd>
              <dt>Price Band</dt><dd>{c.price_band || "—"}</dd>
              <dt>Opened</dt><dd>{fmtDate(c.account_opened)}</dd>
            </dl>
          </div>
        </div>
      </>}
    </DetailShell>
  )
}

// ── Sales Order Detail ────────────────────────────────────────────────────────

export function SalesOrderDetail({ company, id }: { company: string; id: string }) {
  const { data: o, loading, error } = useData<SalesOrderDetail>(
    () => api.sales.getOrder(company, id), [company, id]
  )
  return (
    <DetailShell loading={loading} error={error}>
      {o && <>
        <a href={`#/${company}/sales-orders`} className="back-link">← Sales Orders</a>
        <div className="detail-grid">
          <div className="detail-card">
            <h3>Order</h3>
            <dl>
              <dt>Order No</dt><dd><code>{o.order_no}</code></dd>
              <dt>Customer</dt><dd>{o.customer_name || o.customer_account}</dd>
              <dt>Ref</dt><dd>{o.customer_ref || "—"}</dd>
              <dt>Order Date</dt><dd>{fmtDate(o.order_date_serial)}</dd>
              <dt>Delivery</dt><dd>{fmtDate(o.delivery_date_serial)}</dd>
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
        </div>
        {o.lines.length > 0 && (
          <div className="detail-lines">
            <h3>Lines</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Stock Code</th><th>Description</th>
                  <th className="r">Ordered</th><th className="r">Sent</th>
                  <th>Unit</th><th className="r">Total</th><th>Status</th><th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l: SalesOrderLine) => (
                  <tr key={l.line_no}>
                    <td>{l.line_no}</td>
                    <td>{l.stock_account_code ? <code>{l.stock_account_code}</code> : "—"}</td>
                    <td>{l.short_description || "—"}</td>
                    <td className="r">{l.qty_ordered ?? "—"}</td>
                    <td className="r">{l.qty_sent ?? "—"}</td>
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
      </>}
    </DetailShell>
  )
}

// ── Invoice Detail ────────────────────────────────────────────────────────────

export function InvoiceDetail({ company, id }: { company: string; id: string }) {
  const { data: inv, loading, error } = useData<InvoiceDetail>(
    () => api.sales.getInvoice(company, id), [company, id]
  )
  return (
    <DetailShell loading={loading} error={error}>
      {inv && <>
        <a href={`#/${company}/invoices`} className="back-link">← Invoices</a>
        <div className="detail-grid">
          <div className="detail-card">
            <h3>Invoice</h3>
            <dl>
              <dt>Invoice No</dt><dd><code>{inv.doc_no}</code></dd>
              <dt>Customer</dt><dd>{inv.customer_name || inv.customer_account}</dd>
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
        </div>
      </>}
    </DetailShell>
  )
}

// ── Stock Detail ──────────────────────────────────────────────────────────────

export function StockDetail({ company, id }: { company: string; id: string }) {
  const { data: s, loading, error } = useData<StockItemDetail>(
    () => api.stock.get(company, id), [company, id]
  )
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
              <dt>Attributes</dt><dd>{[s.attribute_1, s.attribute_2, s.attribute_3, s.attribute_4, s.attribute_5].filter(Boolean).join(" / ") || "—"}</dd>
              <dt>Status</dt><dd><Badge value={s.status} /></dd>
              <dt>Warehouse</dt><dd>{s.warehouse || "—"}</dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Stock Levels</h3>
            <dl>
              <dt>In Stock</dt><dd>{s.stock_qty}</dd>
              <dt>Free Stock</dt><dd>{s.free_stock}</dd>
              <dt>On PO</dt><dd>{s.po_qty ?? "—"}</dd>
              <dt>On SO</dt><dd>{s.so_qty ?? "—"}</dd>
              <dt>Unit 1</dt><dd>{s.stock_unit_1 || "—"}</dd>
              <dt>Unit 2</dt><dd>{s.stock_unit_2 || "—"}</dd>
            </dl>
          </div>
          <div className="detail-card">
            <h3>Pricing</h3>
            <dl>
              <dt>Cost</dt><dd>{s.cost_price ?? "—"}</dd>
              <dt>List</dt><dd>{s.list_price ?? "—"}</dd>
              <dt>Sell</dt><dd>{s.sell_price ?? "—"}</dd>
            </dl>
          </div>
        </div>
      </>}
    </DetailShell>
  )
}

// ── Purchase Order Detail ─────────────────────────────────────────────────────

export function PurchaseOrderDetail({ company, id }: { company: string; id: string }) {
  const { data: o, loading, error } = useData<PurchaseOrderDetail>(
    () => api.purchases.getOrder(company, id), [company, id]
  )
  return (
    <DetailShell loading={loading} error={error}>
      {o && <>
        <a href={`#/${company}/purchase-orders`} className="back-link">← Purchase Orders</a>
        <div className="detail-grid">
          <div className="detail-card">
            <h3>Order</h3>
            <dl>
              <dt>Order No</dt><dd><code>{o.order_no}</code></dd>
              <dt>Supplier</dt><dd>{o.supplier_name || o.supplier_account}</dd>
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
                    <td>{l.stock_account_code ? <code>{l.stock_account_code}</code> : "—"}</td>
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
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.grn.list>>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.grn.list(company).then(setRows).catch(console.error).finally(() => setLoading(false))
  }, [company])

  async function viewCerts(grnNo: string) {
    try {
      const certs = await api.grn.certs(company, grnNo)
      if (!certs.length) return
      certs.forEach(c => window.open(c.url, "_blank", "noopener"))
    } catch (e) { console.error(e) }
  }

  return (
    <Shell loading={loading} error={null}>
      <div style={{ marginBottom: "1rem" }}>
        <button className="action-btn" onClick={() => location.hash = `#/${company}/grn/new`}>+ New GRN</button>
      </div>
      <table>
        <thead><tr>
          <th>GRN No</th><th>Stock Code</th><th>Heat No</th><th>Spec</th><th>Grade</th>
          <th>Qty</th><th>Price</th><th>Warehouse</th><th>Created</th><th>Spec</th><th>Certs</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.grn_no}>
              <td><strong>{r.grn_no}</strong></td>
              <td>{r.stock_account_code}</td>
              <td>{r.heat_no}</td>
              <td>{r.spec}</td>
              <td>{r.grade}</td>
              <td>{r.quantity != null ? `${r.quantity} ${r.unit ?? ""}` : ""}</td>
              <td>{r.price_gbp != null ? `£${r.price_gbp}/${r.price_basis}` : ""}</td>
              <td>{r.warehouse}</td>
              <td>{r.created_at?.slice(0, 10)}</td>
              <td>{r.conformance_pass === true
                ? <span className="badge badge--pass">PASS</span>
                : r.conformance_pass === false
                ? <span className="badge badge--fail">FAIL</span>
                : ""}</td>
              <td>{r.cert_count > 0
                ? <button className="action-btn" onClick={() => viewCerts(r.grn_no)}>View ({r.cert_count})</button>
                : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  )
}

// ── Stock batches list ────────────────────────────────────────────────────────
type SplitState = { batchNo: string; max: number; qty: string; length_mm: string; saving: boolean; err: string | null }

export function StockBatchList({ company }: { company: string }) {
  const [rows, setRows] = useState<StockBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [split, setSplit] = useState<SplitState | null>(null)

  function reload() {
    setLoading(true)
    api.batches.list(company).then(setRows).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(reload, [company])

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

  return (
    <Shell loading={loading} error={null}>
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
          <th>Heat No</th><th>Cert Ref</th><th>Qty Rec'd</th><th>Qty Avail</th>
          <th>Unit</th><th>Warehouse</th><th>Conform</th><th>Status</th><th>Date</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td><strong>{r.batch_no}</strong></td>
              <td>{r.grn_no}</td>
              <td>{r.stock_account_code}</td>
              <td>{r.grade}</td>
              <td>{r.spec}</td>
              <td>{r.heat_no}</td>
              <td>{r.cert_ref}</td>
              <td>{r.qty_received}</td>
              <td>{r.qty_available}</td>
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
          ))}
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

export function GRNNew({ company }: { company: string }) {
  const [files, setFiles]     = useState<File[]>([])
  const [extracting, setExtr] = useState(false)
  const [draft, setDraft]     = useState<GRNDraft | null>(null)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState("")
  const [error, setError]     = useState("")

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
    } catch (e: unknown) { setError(String(e)) }
    finally { setSaving(false) }
  }

  if (done) return (
    <div className="dispatch-header" style={{ padding: "2rem" }}>
      <div className="dispatch-ok">GRN {done} confirmed and saved.</div>
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
