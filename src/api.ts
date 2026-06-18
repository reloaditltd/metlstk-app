import { supabase } from "./supabase"

const BASE       = import.meta.env.VITE_API_URL   ?? "http://localhost:8000"
const FALLBACK   = import.meta.env.VITE_API_TOKEN ?? ""  // dev fallback key

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token ?? FALLBACK
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function get<T>(path: string): Promise<T> {
  const headers = await authHeader()
  return fetch(`${BASE}${path}`, { headers }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json() as Promise<T>
  })
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers = { ...await authHeader(), "Content-Type": "application/json" }
  return fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) }).then(async r => {
    if (!r.ok) {
      const detail = await r.json().catch(() => null)
      throw new Error(detail?.detail ?? `${r.status} ${r.statusText}`)
    }
    return r.json() as Promise<T>
  })
}

export type Customer = {
  account_code: string
  name: string
  telephone: string | null
  email: string | null
  credit_limit_gbp: number
  current_balance_gbp: number
  account_opened: string | null
  on_hold: boolean
}

export type SalesOrder = {
  order_no: string
  customer_account: string
  customer_name: string | null
  order_date: string | null
  delivery_date: string | null
  net_gbp: number
  vat_gbp: number
  total_gbp: number
  status: string | null
  customer_ref: string | null
}

export type Invoice = {
  doc_no: string
  customer_account: string
  customer_name: string | null
  invoice_date: string | null
  net_gbp: number
  vat_gbp: number
  total_gbp: number
  posted: boolean | null
}

export type CustomerDetail = {
  account_code: string; name: string
  telephone: string | null; fax: string | null
  email: string | null; website: string | null
  address_line_1: string | null; address_line_2: string | null
  address_line_3: string | null; address_line_4: string | null; postcode: string | null
  credit_limit_gbp: number; insured_limit_gbp: number
  current_balance_gbp: number; sales_order_balance_gbp: number
  invoice_balance_gbp: number; ledger_balance_gbp: number
  sales_mtd_gbp: number; sales_ytd_gbp: number; sales_last_year_gbp: number
  on_hold: boolean; hold_reason: string | null; on_super_hold: boolean | null
  payment_due_days: number | null; terms: string | null
  account_opened: string | null; vat_code: string | null
  price_band: string | null; currency: string | null
}

export type SalesOrderLine = {
  line_no: number; stock_account_code: string | null
  short_description: string | null; qty_ordered: string | null
  qty_sent: string | null; unit_ordered_display: string | null
  price: string | null; line_total_gbp: number | null
  status: string | null; delivery_date: string | null
}
export type SalesOrderDetail = {
  order_no: string; customer_account: string; customer_name: string | null
  order_date_serial: string | null; delivery_date_serial: string | null
  net_amount: string | null; vat: string | null; total_amount: string | null
  status: string | null; customer_ref: string | null; order_notes: string | null
  lines: SalesOrderLine[]
}

export type InvoiceDetail = {
  doc_no: string; customer_account: string; customer_name: string | null
  invoice_date_serial: string | null; posted: boolean | null
  payment_terms: string | null; currency: string | null
  net_amount_gbp: number | null; vat_amount_gbp: number | null
  total_amount_gbp: number | null; cost_amount_gbp: number | null
}

export type StockItemDetail = {
  account_code: string; description_1: string | null; short_description: string | null
  attribute_1: string | null; attribute_2: string | null
  attribute_3: string | null; attribute_4: string | null; attribute_5: string | null
  stock_unit_1: string | null; stock_unit_2: string | null
  stock_qty: string; free_stock: string; po_qty: string | null; so_qty: string | null
  cost_price: string | null; list_price: string | null; sell_price: string | null
  status: string | null; warehouse: string | null
}

export type PurchaseOrderLine = {
  line_no: number; stock_account_code: string | null
  description_1: string | null; short_description: string | null
  qty_ordered: string | null; qty_received: string | null
  unit_ordered_display: string | null; price: string | null
  line_total_gbp: number | null; status: string | null; delivery_date: string | null
}
export type PurchaseOrderDetail = {
  order_no: string; supplier_account: string; supplier_name: string | null
  order_date_serial: string | null; deliver_by_serial: string | null
  net_amount: string | null; vat: string | null; total_amount: string | null
  status: string | null; supplier_ref: string | null; order_notes: string | null
  lines: PurchaseOrderLine[]
}

export type PurchaseOrder = {
  order_no: string
  supplier_account: string
  supplier_name: string | null
  order_date: string | null
  deliver_by: string | null
  net_gbp: number
  vat_gbp: number
  total_gbp: number
  status: string | null
  supplier_ref: string | null
}

export type ConformanceRow = {
  element: string
  cert_value: number
  upper: number | null
  lower: number | null
  pass: boolean
}

export type CreditStatus = {
  account_code: string; name: string
  on_hold: boolean; on_super_hold: boolean
  override_credit_limit: boolean; salesperson_id: string | null
  credit_limit_gbp: number; balance_gbp: number; available_gbp: number
  can_order: boolean; credit_ok: boolean
}

export type NewSalesOrderLine = {
  stock_account_code: string; description_1?: string; short_description?: string
  qty_ordered: number; unit_ordered_display?: string
  price_basis?: string; price: number; delivery_date?: string
}

export type NewSalesOrder = {
  customer_account: string; customer_ref?: string; order_notes?: string
  delivery_date?: string
  delivery_address_line_1?: string; delivery_address_line_2?: string
  delivery_address_line_3?: string; delivery_address_line_4?: string
  delivery_postcode?: string; contact?: string; salesperson_id?: string
  override_credit?: boolean; lines: NewSalesOrderLine[]
}

export type StockBatch = {
  id: number
  batch_no: string
  grn_no: string
  parent_batch_id: number | null
  stock_account_code: string | null
  heat_no: string | null
  cert_ref: string | null
  grade: string | null
  spec: string | null
  qty_received: number
  qty_available: number
  unit: string | null
  length_mm: number | null
  warehouse: string | null
  conformance_pass: boolean | null
  status: string
  created_at: string
}

export type StockItem = {
  id: number
  account_code: string
  description_1: string | null
  short_description: string | null
  attribute_1: string | null
  attribute_2: string | null
  stock_unit_1: string | null
  stock_qty: string
  free_stock: string
  cost_price: string
  sell_price: string
  status: string | null
  warehouse: string | null
}

const v1 = (co: string) => `/api/v1/${co}`

function qs(params: Record<string, string | number>) {
  return Object.entries(params)
    .filter(([, v]) => v !== "" && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")
}

export const api = {
  purchases: {
    listOrders: (co: string, limit = 50, offset = 0, search = "") =>
      get<PurchaseOrder[]>(`${v1(co)}/purchase-orders?${qs({ limit, offset, search })}`),
    getOrder: (co: string, no: string) =>
      get<PurchaseOrderDetail>(`${v1(co)}/purchase-orders/${encodeURIComponent(no)}`),
  },
  sales: {
    listOrders: (co: string, limit = 50, offset = 0, search = "") =>
      get<SalesOrder[]>(`${v1(co)}/sales-orders?${qs({ limit, offset, search })}`),
    getOrder: (co: string, no: string) =>
      get<SalesOrderDetail>(`${v1(co)}/sales-orders/${encodeURIComponent(no)}`),
    createOrder: (co: string, body: NewSalesOrder) =>
      post<{ order_no: string; net_gbp: number; total_gbp: number }>(`${v1(co)}/sales-orders`, body),
    listInvoices: (co: string, limit = 50, offset = 0, search = "") =>
      get<Invoice[]>(`${v1(co)}/invoices?${qs({ limit, offset, search })}`),
    getInvoice: (co: string, no: string) =>
      get<InvoiceDetail>(`${v1(co)}/invoices/${encodeURIComponent(no)}`),
  },
  customers: {
    list: (co: string, limit = 50, offset = 0, search = "") =>
      get<Customer[]>(`${v1(co)}/customers?${qs({ limit, offset, search })}`),
    get: (co: string, code: string) =>
      get<CustomerDetail>(`${v1(co)}/customers/${encodeURIComponent(code)}`),
    credit: (co: string, code: string) =>
      get<CreditStatus>(`${v1(co)}/customers/${encodeURIComponent(code)}/credit`),
  },
  stock: {
    list: (co: string, limit = 50, offset = 0, search = "") =>
      get<StockItem[]>(`${v1(co)}/stock-items?${qs({ limit, offset, search })}`),
    get: (co: string, code: string) =>
      get<StockItemDetail>(`${v1(co)}/stock-items/${encodeURIComponent(code)}`),
    postTransaction: (co: string, body: object) =>
      post<{ id: number; txn_type: string; qty: string }>(`${v1(co)}/stock-transactions`, body),
  },
  grn: {
    extract: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const form = new FormData()
      files.forEach(f => form.append("files", f))
      return fetch(`${BASE}${v1(co)}/grn/extract`, { method: "POST", headers, body: form }).then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
        return r.json() as Promise<{ extracted: Record<string, unknown>; ai_raw_text: string; cert_paths: string[]; conformance: ConformanceRow[] }>
      })
    },
    create: (co: string, body: object) =>
      post<{ grn_no: string; id: number; batch_no: string | null }>(`${v1(co)}/grn`, body),
    list: (co: string) =>
      get<{ grn_no: string; supplier_account: string | null; stock_account_code: string | null; quantity: number | null; unit: string | null; cert_ref: string | null; heat_no: string | null; spec: string | null; grade: string | null; price_gbp: number | null; price_basis: string | null; warehouse: string | null; confirmed_at: string | null; created_at: string; cert_count: number; conformance_pass: boolean | null }[]>(
        `${v1(co)}/grn`
      ),
    certs: (co: string, grnNo: string) =>
      get<{ path: string; url: string }[]>(`${v1(co)}/grn/${encodeURIComponent(grnNo)}/certs`),
  },
  batches: {
    list: (co: string, account_code?: string, status?: string) => {
      const p = new URLSearchParams()
      if (account_code) p.set("account_code", account_code)
      if (status) p.set("status", status)
      const q = p.toString()
      return get<StockBatch[]>(`${v1(co)}/stock-batches${q ? "?" + q : ""}`)
    },
    split: (co: string, batchNo: string, body: { qty_cut: number; length_mm?: number; warehouse?: string }) =>
      post<{ batch_no: string; id: number }>(`${v1(co)}/stock-batches/${encodeURIComponent(batchNo)}/split`, body),
  },
  dispatch: {
    create: (co: string, body: { sales_order_no: string; lines: object[] }) =>
      post<{ doc_no: string; order_no: string; line_count: number; net_gbp: number }>(
        `${v1(co)}/dispatch`, body
      ),
    list: (co: string) =>
      get<{ doc_no: string; customer_name: string | null; sales_order_no: string; date: string; net_gbp: number; printed: boolean; invoiced: boolean }[]>(
        `${v1(co)}/delivery-notes`
      ),
  },
}
