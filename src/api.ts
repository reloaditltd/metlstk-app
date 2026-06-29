import { supabase } from "./supabase"

const _rawBase   = import.meta.env.VITE_API_URL   ?? "http://localhost:8000"
const BASE       = /^http:\/\/localhost/.test(_rawBase) ? _rawBase : _rawBase.replace(/^http:/, "https:")
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

async function send<T>(method: string, path: string, body: unknown): Promise<T> {
  const headers = { ...await authHeader(), "Content-Type": "application/json" }
  return fetch(`${BASE}${path}`, { method, headers, body: JSON.stringify(body) }).then(async r => {
    if (!r.ok) {
      const detail = await r.json().catch(() => null)
      throw new Error(detail?.detail ?? `${r.status} ${r.statusText}`)
    }
    return r.json() as Promise<T>
  })
}

const post = <T>(path: string, body: unknown) => send<T>("POST", path, body)
const put  = <T>(path: string, body: unknown) => send<T>("PUT", path, body)
const patch = <T>(path: string, body: unknown) => send<T>("PATCH", path, body)
const del   = <T>(path: string) => send<T>("DELETE", path, undefined)

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const headers = await authHeader()
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: form })
  if (!res.ok) throw new Error(res.status.toString())
  return res.json() as Promise<T>
}

// ── Portal: auth comes from a Supabase token in localStorage, not the internal session ──
export const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  as string
export const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON as string

async function portalGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("portal_token") ?? ""
  const r = await fetch(`${BASE}/api/v1/portal${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

async function portalPost<T>(path: string, body: unknown): Promise<T> {
  const token = localStorage.getItem("portal_token") ?? ""
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const r = await fetch(`${BASE}/api/v1/portal${path}`, {
    method: "POST", headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  if (r.status === 204) return undefined as unknown as T
  return r.json() as Promise<T>
}

async function portalPatch<T>(path: string, body: unknown): Promise<T> {
  const token = localStorage.getItem("portal_token") ?? ""
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const r = await fetch(`${BASE}/api/v1/portal${path}`, {
    method: "PATCH", headers, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  if (r.status === 204) return undefined as unknown as T
  return r.json() as Promise<T>
}

export type PortalMe = { company: string; customer_account: string; full_name: string | null; email: string; role: string }
export type PortalOrder = {
  order_no: string; order_date_serial: string | null; status: string | null
  customer_ref: string | null; net_gbp: number; vat_gbp: number; total_gbp: number
  customer_status: string
}
export type PortalOrderLine = {
  line_no: number; stock_account_code: string | null; short_description: string | null
  qty_ordered: string | null; qty_sent: string | null; unit_ordered_display: string | null
  line_total_gbp: number | null; status: string | null; delivery_date_serial: string | null
}
export type PortalOrderDetail = PortalOrder & {
  customer_account: string; delivery_date_serial: string | null; order_notes: string | null
  lines: PortalOrderLine[]
}
export type PortalAccount = {
  account_name: string | null; credit_limit_gbp: number; current_balance_gbp: number
  sales_order_balance_gbp: number; on_hold: boolean; on_super_hold: boolean
  credit_status: "in_credit" | "near_limit" | "over_limit" | "on_hold"; available_gbp: number
}
export type PortalInvoice = {
  doc_no: string; invoice_date_serial: string | null; due_date_serial: string | null
  status: string | null; posted: boolean | null; sales_order_no: string | null
  net_gbp: number; vat_gbp: number; total_gbp: number
}
export type Notification = {
  id: string
  event_type: "status_change" | "new_document" | "new_invoice"
  entity_ref: string
  payload: Record<string, unknown>
  created_at: string
  is_read: boolean
}
export type NotifPref = {
  event_type: string
  email_enabled: boolean
  in_portal_enabled: boolean
}

export const portalApi = {
  me: () => portalGet<PortalMe>("/me"),
  orders: () => portalGet<PortalOrder[]>("/orders"),
  order: (no: string) => portalGet<PortalOrderDetail>(`/orders/${encodeURIComponent(no)}`),
  account: () => portalGet<PortalAccount>("/account"),
  invoices: () => portalGet<PortalInvoice[]>("/invoices"),
  bundleUrl: (orderNo: string) => portalGet<{ url: string; expires_in: number }>(`/orders/${encodeURIComponent(orderNo)}/bundle`),
  notifications: () => portalGet<Notification[]>("/notifications"),
  markRead: (id: string) => portalPost<void>(`/notifications/${id}/read`, undefined),
  getPrefs: () => portalGet<NotifPref[]>("/notifications/preferences"),
  updatePref: (body: NotifPref) => portalPatch<void>("/notifications/preferences", body),
  statementPdfUrl: (months = 12) => portalPdfUrl(`/statement.pdf?months=${months}`),
}

export async function portalLogin(email: string, password: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const data = await r.json()
  if (!r.ok || !data.access_token) throw new Error(data.error_description ?? data.msg ?? "Login failed")
  localStorage.setItem("portal_token", data.access_token)
}

async function pdfUrl(path: string): Promise<string> {
  const headers = await authHeader()
  const r = await fetch(`${BASE}${path}`, { headers })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return URL.createObjectURL(await r.blob())
}

async function portalPdfUrl(path: string): Promise<string> {
  const token = localStorage.getItem("portal_token") ?? ""
  const r = await fetch(`${BASE}/api/v1/portal${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return URL.createObjectURL(await r.blob())
}

export type Customer = {
  account_code: string
  name: string
  address_line_1: string | null
  telephone: string | null
  email: string | null
  credit_limit_gbp: number
  current_balance_gbp: number
  account_opened: string | null
  on_hold: boolean
}

export type Supplier = {
  account_code: string
  name: string
  address_line_1: string | null
  telephone: string | null
  email: string | null
  supplier_type: string | null
  approved_supplier: boolean | null
  on_hold: boolean | null
  delivery_rating: number | null
  quality_rating: number | null
  lead_time_days: number | null
}

export type SupplierDetail = Supplier & {
  address_line_2: string | null; address_line_3: string | null; address_line_4: string | null
  postcode: string | null; fax: string | null; website: string | null
  vat_number: string | null; currency: string | null; notes: string | null
  qa_approved: boolean | null; qa_cert_no: string | null; qa_body: string | null
  payment_due_days: number | null; settlement_days: number | null; terms: string | null
  approval_ref: string | null; on_hold: boolean | null; hold_reason: string | null
  preferred_contact: string | null; accounting_ref: string | null
  contacts: { seq: number; name: string | null; role: string | null; email: string | null; telephone: string | null }[]
  recent_orders: { order_no: string; order_date_serial: string | null; delivery_date_serial: string | null; status: string | null; net_gbp: number | null }[]
  performance: { total_orders: number; overdue_orders: number; avg_lead_days: number | null; total_spend_gbp: number | null }[]
}

export type TermsDocument = {
  id: number; terms_type: string; version: string; title: string | null
  effective_date: string | null; superseded_at: string | null; created_at: string
}

export type TermsDocumentDetail = TermsDocument & {
  content_text: string | null
  acceptances: { id: number; customer_account: string; accepted_at: string; accepted_by: string | null; method: string | null; notes: string | null }[]
}

export type CustomerTermsStatus = {
  current_terms: { id: number; version: string; title: string | null; effective_date: string | null } | null
  latest_acceptance: { id: number; accepted_at: string; accepted_by: string | null; method: string | null } | null
  accepted: boolean | null
}

export type SupplierPerformance = {
  account_code: string; name: string; supplier_type: string | null
  approved_supplier: boolean | null; on_hold: boolean | null
  delivery_rating: number | null; quality_rating: number | null
  total_orders: number; overdue_orders: number; avg_lead_days: number | null; total_spend_gbp: number | null
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
  derived_status: string
}

export type Allocation = {
  id: number
  line_no: number
  qty: string
  cert_ok: boolean | null
  cert_note: string | null
  status: string
  allocated_at: string
  allocation_type: "soft" | "hard"
  batch_no: string
  heat_no: string | null
  grade: string | null
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
  sales_order_no: string | null
  status: string | null
  age_days: number | null
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
  account_opened: string | null; vat_code: string | null; vat_number: string | null
  price_band: string | null; currency: string | null
  salesperson_id: string | null; salesperson_name: string | null
  notes: string | null; accounting_ref: string | null
  contacts: { seq: number; name: string | null; role: string | null; email: string | null; telephone: string | null }[]
}

export type SalesOrderLine = {
  line_no: number; stock_account_code: string | null
  short_description: string | null; qty_ordered: string | null
  qty_sent: string | null; unit_ordered_display: string | null
  price: string | null; line_total_gbp: number | null
  status: string | null; delivery_date: string | null
  price_unit: string | null; line_notes: string | null
  back_to_back_po_no: string | null
  is_cut_piece: boolean | null; cut_length_mm: number | null; saw_type_id: number | null
  margin_pct: number | null; price_is_override: boolean | null
  cut_price_breakdown: CutPriceResult | null
  qty_invoiced: number
}
export type SalesOrderDetail = {
  order_no: string; customer_account: string; customer_name: string | null
  order_date_serial: string | null; delivery_date_serial: string | null
  net_amount: string | null; vat: string | null; total_amount: string | null
  status: string | null; customer_ref: string | null; order_notes: string | null
  carriage_method: string | null
  delivery_address_line_1: string | null; delivery_address_line_2: string | null
  delivery_address_line_3: string | null; delivery_address_line_4: string | null
  delivery_postcode: string | null
  lines: SalesOrderLine[]
  derived_status: string
  delivery_notes: { doc_no: string; doc_date: string; despatch_status: string; invoiced: boolean }[]
  invoices: { doc_no: string; invoice_date_serial: string; net_amount: number; total_amount: number; status: string; posted: boolean | null }[]
  contract_review: { status: string; overall_match: boolean | null; signed_off_at: string | null } | null
  allocation: { lines_total: number; lines_allocated: number } | null
}

export type ContractReviewField = {
  field: string; customer: unknown; system: unknown
  verdict: "match" | "review" | "mismatch" | "unresolved"
}
export type ContractReviewLine = {
  so_line_no: number | null; unmatched?: string; fields: ContractReviewField[]
}
export type ContractReview = {
  id: number; order_no: string; source: "wizard_po" | "uploaded" | "manual"
  document_path: string | null; extracted: unknown
  comparison: { overall_match: boolean | null; lines: ContractReviewLine[] } | null
  overall_match: boolean | null
  status: "matched" | "discrepancies" | "manual" | "signed_off"
  signed_off_by: string | null; signed_off_at: string | null; override_note: string | null
  created_by: string | null; created_at: string
}

export type InvoiceLine = {
  line_no: number; stock_account_code: string | null; heat_no: string | null; cert_ref: string | null
  qty: string | null; price_gbp: number | null; line_total_gbp: number | null
  weight_theoretical_kg: string | null; weight_actual_kg: string | null
  weight_billed_kg: string | null; weight_basis: string | null; variance_flag: boolean | null
}

export type InvoiceDetail = {
  doc_no: string; customer_account: string; customer_name: string | null
  invoice_date_serial: string | null; due_date_serial: string | null; posted: boolean | null
  payment_terms: string | null; currency: string | null; status: string | null
  sales_order_no: string | null; delivery_doc_no: string | null
  weight_basis: string | null; weight_variance_flag: boolean | null
  weight_theoretical_kg: string | null; weight_actual_kg: string | null
  net_amount_gbp: number | null; vat_amount_gbp: number | null
  total_amount_gbp: number | null; cost_amount_gbp: number | null
  lines?: InvoiceLine[]
}

export type StockItemDetail = {
  id: number; account_code: string; description_1: string | null; short_description: string | null
  attribute_1: string | null; attribute_2: string | null
  attribute_3: string | null; attribute_4: string | null; attribute_5: string | null
  stock_unit_1: string | null; stock_unit_2: string | null
  stock_qty: string; free_stock: string; po_qty: string | null; so_qty: string | null
  weight_per_metre: string | null
  cost_price: string | null; list_price: string | null; sell_price: string | null
  reorder_level: string | null; reorder_qty: string | null
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
  supplier_invoice_no: string | null
  matched_net_amount: string | null; matched_vat_amount: string | null; matched_status: string | null
  invoice_date_serial: string | null
  invoice_approved_by: string | null; invoice_approved_at: string | null; invoice_paid_at: string | null
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

export type Finding = { code: string; level: "warn" | "block"; message: string; fields: string[] | null }
export type ReadinessLine = {
  line_no: number
  summary: { stock_ready: boolean; cert_ready: boolean; commercial_ready: boolean; delivery_ready: boolean; overall_pass: boolean }
  findings: Finding[]
}
export type CertCheckLine = { line_no: number; findings: Finding[]; overridable: boolean }
export type AdvanceResult = { stage: number; findings: Finding[]; can_advance: boolean }
export type WizardDraftLine = {
  stock_account_code?: string; short_description?: string
  qty_ordered: number; unit_ordered_display?: string
  price_basis?: string; price: number; delivery_date?: string
  batch_no?: string; line_notes?: string; price_unit?: string
  is_cut_piece?: boolean; cut_length_mm?: number; saw_type_id?: number
  margin_pct?: number; price_is_override?: boolean; cut_price_breakdown?: CutPriceResult | null
  grade_code?: string; required_cert_type?: string; material_type?: string; specification?: string
  surcharge_confirmed?: boolean
  processing?: unknown[]
}
export type WizardPatch = {
  customer_account?: string; customer_ref?: string; delivery_date?: string
  carriage_method?: string; haulier_account?: string
  delivery_contact_name?: string; delivery_contact_phone?: string; access_restrictions?: string
  delivery_address_line_1?: string; delivery_address_line_2?: string
  delivery_address_line_3?: string; delivery_address_line_4?: string; delivery_postcode?: string
  order_notes?: string; salesperson_id?: string
  lines?: WizardDraftLine[]
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
  qty_allocated: number    // sum of qty on open SO lines pointing to this batch
  unit: string | null
  length_mm: number | null
  warehouse: string | null
  weight_theoretical_kg: number | null
  weight_actual_kg: number | null
  conformance_pass: boolean | null
  status: string
  created_at: string
  // cost fields added by migration 064
  cost_base: number | null
  cost_alloy_surcharge: number | null
  cost_total: number | null
  cost_basis: string | null
}

export type BatchGenealogyLink = {
  id: number
  parent_batch_id: number
  child_batch_id: number
  quantity_from_parent: string | null
  weight_from_parent_kg: string | null
  created_at: string
  parent_batch_no?: string
  child_batch_no?: string
}

export type StockBatchDetail = StockBatch & {
  manufacturer_account: string | null
  manufacturer_name: string | null
  country_of_origin: string | null
  mtcs: { id: number; cert_reference: string | null; heat_number: string | null; grade_code: string | null; verified_at: string | null }[]
  genealogy: { parents: BatchGenealogyLink[]; children: BatchGenealogyLink[] }
}

export type StockSummaryRow = {
  grade: string
  warehouse: string
  batches: number
  qty_available: number | null
  weight_theoretical_kg: number | null
  weight_actual_kg: number | null
}

export type BatchFilters = {
  account_code?: string; status?: string; grade?: string; heat_no?: string
  warehouse?: string; length_min?: number; length_max?: number
  search?: string; uncerted?: boolean; remnants_only?: boolean
}

export type UserMe = {
  id: string; full_name: string | null; email: string | null
  phone: string | null; mobile: string | null; job_title: string | null
  role: string | null; companies: string[] | null
}

export type NewPOLine = {
  stock_account_code: string
  description?: string
  qty_ordered: number
  unit?: string
  price?: number
  attribute_1?: string; attribute_2?: string; attribute_3?: string; attribute_4?: string
  size_1_mm?: number; weight_per_metre?: number
}
export type NewPurchaseOrder = {
  supplier_account?: string
  supplier_ref?: string
  lines: NewPOLine[]
}
export type POExtract = {
  supplier_name: string | null
  supplier_ref: string | null
  lines: { stock_code: string | null; description: string | null; grade: string | null; size_mm: number | null; qty: number | null; unit: string | null; price_per_unit: number | null }[] | null
}

export type StockItemIn = {
  account_code: string
  description_1?: string; short_description?: string
  attribute_1?: string; attribute_2?: string; attribute_3?: string; attribute_4?: string
  size_1_mm?: number
  stock_unit_1?: string; stock_unit_2?: string; weight_per_metre?: number
  price_basis?: string
  cost_price?: number; list_price?: number; sell_price?: number
  warehouse?: string; status?: string
}

export type StockItem = {
  id: number
  account_code: string
  description_1: string | null
  short_description: string | null
  attribute_1: string | null
  attribute_2: string | null
  attribute_3: string | null
  attribute_4: string | null
  stock_unit_1: string | null
  stock_qty: string
  po_qty: string | null
  free_stock: string
  cost_price: string
  sell_price: string
  status: string | null
  warehouse: string | null
}

export type StockItemBatch = {
  batch_no: string; heat_no: string | null; cert_ref: string | null; grade: string | null
  qty_available: string | null; unit: string | null; length_mm: string | null
  weight_theoretical_kg: string | null; weight_actual_kg: string | null
  warehouse: string | null; status: string | null
  grn_no: string | null; supplier_account: string | null; purchase_order_no: string | null
  delivery_note_ref: string | null; grn_date: string | null
}

export type LegacyBatch = {
  transaction_no: number; cast_no: string | null; lot_no: string | null; mill_cert_no: string | null
  grade: string | null; qty: string | null; qty_left: string | null; qty_allocated: string | null
  current_location: string | null
}

export type StockFilters = { limit?: number; offset?: number; search?: string; material?: string; section?: string; grade?: string; finish?: string }

export type StockAttribute = { code: string; description: string | null; slot: number; color_code: string | null }

export type Mtc = {
  id: number
  cert_reference: string | null
  heat_number: string | null
  supplier_account: string | null
  cert_type: string | null
  grade_code: string | null
  standard: string | null
  verified_at: string | null
  created_at: string
  cert_count: number
  batch_count: number
}

export type MtcBatch = {
  batch_no: string; heat_no: string | null
  qty_available: string; status: string; is_primary: boolean
}

export type MtcDetail = {
  id: number; cert_reference: string | null; heat_number: string | null
  supplier_account: string | null; mill_name: string | null; cert_type: string | null
  material_description: string | null; grade_code: string | null; standard: string | null
  chemistry: Record<string, number> | null; mechanical: Record<string, number> | null
  heat_treatment_condition: string | null; test_date: string | null; cert_date: string | null
  authorised_by: string | null; inspected_by: string | null
  cert_paths: string[] | null; ocr_extracted: boolean
  verified_by: string | null; verified_at: string | null; notes: string | null; created_at: string
  batches: MtcBatch[]; conformance: ConformanceRow[]
  mechanical_baseline: GradeMechRow[]
}

export type Quote = {
  quote_no: string; customer_account: string | null; customer_name: string | null
  quote_date: string | null; valid_until: string | null; status: string
  converted_so_no: string | null; net_gbp: number; total_gbp: number; created_at: string
}

export type QuoteLine = {
  line_no: number; stock_account_code: string | null; description: string | null
  grade: string | null; spec: string | null; product_form: string | null
  length_mm: number | null; width_mm: number | null; thickness_mm: number | null; diameter_mm: number | null
  qty: string | null; unit: string | null; weight_theoretical_kg: number | null
  unit_price_gbp: number | null; price_basis: string | null; line_total_gbp: number | null
  required_cert_type: string | null
}

export type QuoteDetail = {
  quote_no: string; customer_account: string | null; customer_name: string | null
  contact: string | null; quote_date: string | null; valid_until: string | null
  status: string; notes: string | null; converted_so_no: string | null
  net_gbp: number; vat_gbp: number; total_gbp: number; lines: QuoteLine[]
}

export type QuoteExtractLine = {
  description?: string; grade?: string; spec?: string; product_form?: string
  length_mm?: number | null; width_mm?: number | null; thickness_mm?: number | null; diameter_mm?: number | null
  qty?: number | null; unit?: string; required_cert_type?: string; weight_theoretical_kg?: number | null
}

export type DeliveryNote = {
  doc_no: string; customer_account: string | null; customer_name: string | null
  sales_order_no: string; date: string | null; net_gbp: number; printed: boolean; invoiced: boolean; customer_ref: string | null
  status: string | null
}

export type DeliveryNoteLine = {
  line_no: number; batch_id: number | null; stock_account_code: string | null
  heat_no: string | null; cert_ref: string | null; short_description: string | null
  ord_qty_out: string | null; stk_qty_out: string | null
  weight_theoretical_kg: string | null; weight_actual_kg: string | null
}

export type DeliveryNoteDetail = {
  doc_no: string; customer_account: string | null; customer_name: string | null
  sales_order_no: string; customer_ref: string | null; despatch_status: string | null
  weighbridge_gross_kg: string | null; weighbridge_tare_kg: string | null
  weighbridge_net_kg: string | null; weighbridge_slip_ref: string | null
  weight_theoretical_kg: string | null
  cert_validated_at: string | null; cert_override_reason: string | null
  lines: DeliveryNoteLine[]
  pod: { delivered_at: string; received_by_name: string | null; pod_notes: string | null; exceptions_noted: string | null }[]
  pod_exceptions: { id: number; dl_line_no: number | null; exception_type: string; qty_short: string | null; notes: string | null; raised_by: string | null; raised_at: string }[]
}

export type SawType = { id: number; name: string; kerf_mm: number; cost_per_cut: number | null; is_active?: boolean }
export type CutPricingRule = { id: number; stock_account_code: string | null; facing_allowance_mm: number; extra_loss_pct: number; min_usable_length_mm: number }
export type CutPriceResult = {
  chargeable_length_mm: number; chargeable_weight_kg: number
  material_cost_per_piece: number; sawing_cost_per_piece: number
  cost_per_piece: number; price_per_piece: number
  line_total: number; short_cut_flag: boolean; min_usable_length_mm: number
}

export type WorkOrder = {
  wo_no: string; operation_type: string | null; status: string
  theoretical_yield_pct: number | null; actual_yield_pct: number | null
  created_at: string; parent_batch_no: string; grade: string | null; heat_no: string | null
}

export type WOOutput = { output_type: string; qty: string | null; length_mm: string | null; weight_kg: string | null; batch_no: string | null }

export type WOPlan = { bars: number[][]; offcuts_mm: number[]; bars_used: number; yield_pct: number; total_piece_mm: number; total_stock_mm: number; error?: string }

export type WorkOrderDetail = {
  wo_no: string; status: string; operation_type: string | null
  cutting_list: { length_mm: number; qty: number }[] | null
  kerf_mm: string | null; end_trim_mm: string | null; min_offcut_mm: string | null
  theoretical_yield_pct: number | null; actual_yield_pct: number | null
  weight_in_kg: string | null; weight_out_product_kg: string | null
  weight_out_remnant_kg: string | null; weight_out_scrap_kg: string | null
  parent_batch_no: string; grade: string | null; heat_no: string | null
  parent_length_mm: string | null; parent_qty_available: string | null
  plan?: WOPlan; outputs: WOOutput[]
  nesting_export_data?: Record<string, unknown> | null
  nesting_result_data?: { utilisation_pct: number; sheets_used: number; remnants?: unknown[]; notes?: string | null } | null
  nesting_exported_at?: string | null
  nesting_imported_at?: string | null
}

export type DashboardSummary = {
  open_orders: number; open_quotes: number; despatches_today: number
  wo_queued: number; wo_in_progress: number; credit_holds: number
  uncerted_batches: number; available_batches: number; stock_weight_kg: number; overdue_invoices: number
  confirmed_orders: number; low_stock_count: number
  open_purchase_orders: number; overdue_pos: number; ap_awaiting_payment: number
  revenue_mtd: number; revenue_ytd: number
}

export type WOReportRow = { status: string; count: number; avg_yield_pct: number | null; scrap_kg: number; remnant_kg: number }

export type CreditHoldRow = { account_code: string; name: string | null; on_hold: boolean; on_super_hold: boolean; hold_reason: string | null; balance_gbp: number; credit_limit_gbp: number }

export type AgedDebtorRow = {
  customer_account: string; name: string | null
  total_gbp: number; d0_30: number; d31_60: number; d61_90: number; d90_plus: number
}

export type OTIFCustomerRow = {
  customer_account: string; name: string | null
  total: number; on_time: number; on_time_pct: number | null
}
export type OTIFMonthRow = { month: string; total: number; on_time: number; on_time_pct: number | null }
export type StockTurnRow = {
  account_code: string; description_1: string | null
  attribute_1: string | null; attribute_2: string | null; attribute_3: string | null
  stock_qty: number; despatched: number; annualized_turn: number | null
}
export type MarginRow = {
  account_code: string; description_1: string | null
  attribute_1: string | null; attribute_2: string | null; attribute_3: string | null
  stock_unit_1: string | null; cost_price: number | null; sell_price: number | null; margin_pct: number | null
}
export type StockValuationRow = {
  account_code: string; description_1: string | null
  attribute_1: string | null; attribute_2: string | null; attribute_3: string | null
  stock_unit_1: string | null; qty: number; cost_price: number; value_gbp: number
}
export type LowStockRow = {
  account_code: string; description_1: string | null
  attribute_1: string | null; attribute_2: string | null; attribute_3: string | null
  stock_unit_1: string | null; qty: number; reorder_level: number; reorder_qty: number
}
export type StockAgeRow = {
  account_code: string; description_1: string | null
  attribute_1: string | null; attribute_3: string | null; stock_unit_1: string | null
  qty_available: number; weight_kg: number; batch_count: number
  oldest_batch_date: string | null; avg_age_days: number
  lt30: number; d30_90: number; d90_180: number; gt180: number
}
export type OverdueInvoiceRow = {
  invoice_no: string; customer_account: string; customer_name: string | null
  telephone: string | null; email: string | null
  invoice_date: number | null; due_date: number | null
  age_days: number; outstanding_gbp: number
}
export type StatementInvoice = {
  doc_no: string; date_serial: string | null; net_gbp: number; total_gbp: number
  outstanding_gbp: number; status: string | null
}
export type StatementPayment = {
  payment_no: string; date_serial: string | null; amount_gbp: number
  method: string | null; reference: string | null
}

export type SalesPerfRow = {
  customer_account: string; customer_name: string | null
  invoice_count: number; net_gbp: number; total_gbp: number
}

export type SupplierSpendRow = {
  supplier_account: string; supplier_name: string | null
  po_count: number; net_gbp: number; total_gbp: number
}

export type SalespersonPerfRow = {
  salesperson_id: string; salesperson_name: string
  customer_count: number; invoice_count: number; total_gbp: number
}

export type MonthlyRevenueRow = {
  month: string; invoice_count: number; net_gbp: number; total_gbp: number
}

export type APRegisterRow = {
  order_no: string; supplier_account: string; supplier_name: string | null
  order_date: string | null; supplier_invoice_no: string | null; invoice_date_serial: number | null
  booked_in_gbp: number; matched_net_gbp: number; matched_vat_gbp: number
  matched_status: string | null
}

export type AuditEntry = {
  id: number; schema_name: string; table_name: string; record_id: string | null
  action: string; old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null
  changed_by: string | null; changed_by_email: string | null; changed_at: string
}

export type Member = { id: number; user_id: string | null; email: string | null; role: string; status: string; created_at: string }
export type Setting = { key: string; value: string }

export type Compliance = { expired: string[]; expiring: string[] }

export type Vehicle = {
  id: number
  registration: string
  vehicle_type: string | null
  max_payload_kg: number | null
  bed_length_mm: number | null
  mot_expiry: string | null
  insurance_expiry: string | null
  service_due_date: string | null
  is_active: boolean
  notes: string | null
  compliance: Compliance
}

export type Driver = {
  id: number
  first_name: string
  last_name: string
  licence_number: string | null
  licence_categories: string[] | null
  licence_expiry: string | null
  cpc_expiry: string | null
  is_active: boolean
  notes: string | null
  compliance: Compliance
}

export type Load = {
  load_id: number
  load_reference: string
  vehicle_id: number | null
  driver_id: number | null
  planned_departure: string | null
  route_description: string | null
  status: string
  created_at: string
}

export type GradeRefRow = {
  werkstoff: string; common_code: string; en_name: string | null; aisi_trade: string | null
  uns: string | null; family: string | null; magnetic: boolean | null; hardenable: boolean | null
  pre: number | null; note: string | null; is_primary_for_code: boolean
}
export type GradeMechRow = {
  product_form: string; condition: string; size_band_max_mm: number | null
  rp02_min: number | null; rp1_min: number | null; rm_min: number | null; rm_max: number | null
  elong_min: number | null; hb_max: number | null; note: string | null
}
export type GradeRefDetail = GradeRefRow & {
  chemistry: Record<string, { lower?: number; upper?: number }> | null
  mechanical: GradeMechRow[]
  equivalents: { werkstoff: string; common_code: string; en_name: string | null; aisi_trade: string | null }[]
}
export type GradeSubstitute = { werkstoff: string; common_code: string; en_name: string | null }
export type SurfaceFinish = { code: string; product_kind: string; process_route: string | null; description: string | null; ra_min: number | null; ra_max: number | null }

const v1 = (co: string) => `/api/v1/${co}`

function qs(params: Record<string, string | number | boolean | undefined>) {
  return Object.entries(params)
    .filter(([, v]) => v !== "" && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string | number | boolean)}`)
    .join("&")
}

export interface AssistChart {
  type: "bar" | "line" | "pie"
  title: string
  x_key: string
  y_key: string
  data: Record<string, unknown>[]
}

export interface AssistResponse {
  reply: string
  actions?: Array<{ type: "navigate"; module: string; label: string }>
  charts?: AssistChart[]
}

export const api = {
  purchases: {
    listOrders: (co: string, limit = 50, offset = 0, search = "", status = "") =>
      get<PurchaseOrder[]>(`${v1(co)}/purchase-orders?${qs({ limit, offset, search, status: status || undefined })}`),
    getOrder: (co: string, no: string) =>
      get<PurchaseOrderDetail>(`${v1(co)}/purchase-orders/${encodeURIComponent(no)}`),
    createOrder: (co: string, body: NewPurchaseOrder) =>
      post<{ order_no: string; lines: number }>(`${v1(co)}/purchase-orders`, body),
    pdf: (co: string, no: string) => pdfUrl(`${v1(co)}/purchase-orders/${encodeURIComponent(no)}/pdf`),
    invoiceMatch: (co: string, no: string, body: { supplier_invoice_no?: string; matched_net_gbp?: number; matched_vat_gbp?: number; matched_status?: string; po_status?: string }) =>
      patch<{ order_no: string }>(`${v1(co)}/purchase-orders/${encodeURIComponent(no)}/invoice-match`, body),
    extract: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const form = new FormData()
      files.forEach(f => form.append("files", f))
      return fetch(`${BASE}${v1(co)}/purchase-orders/extract`, { method: "POST", headers, body: form }).then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
        return r.json() as Promise<POExtract>
      })
    },
  },
  sales: {
    listOrders: (co: string, limit = 50, offset = 0, search = "", includeDrafts = false, status = "") =>
      get<SalesOrder[]>(`${v1(co)}/sales-orders?${qs({ limit, offset, search, include_drafts: includeDrafts || undefined, status: status || undefined })}`),
    getOrder: (co: string, no: string) =>
      get<SalesOrderDetail>(`${v1(co)}/sales-orders/${encodeURIComponent(no)}`),
    createOrder: (co: string, body: NewSalesOrder) =>
      post<{ order_no: string; net_gbp: number; total_gbp: number }>(`${v1(co)}/sales-orders`, body),
    listAllocations: (co: string, orderNo: string) =>
      get<Allocation[]>(`${v1(co)}/sales-orders/${encodeURIComponent(orderNo)}/allocations`),
    allocate: (co: string, orderNo: string, body: { line_no: number; batch_no: string; qty: number; override_cert?: boolean }) =>
      post<{ allocation_id: number; batch_no: string; qty: number; cert_ok: boolean; cert_note: string | null }>(
        `${v1(co)}/sales-orders/${encodeURIComponent(orderNo)}/allocate`, body),
    deallocate: (co: string, orderNo: string, allocId: number) =>
      del<{ deallocated: number; qty_restored: number }>(
        `${v1(co)}/sales-orders/${encodeURIComponent(orderNo)}/allocations/${allocId}`),
    hardenAllocation: (co: string, orderNo: string, allocId: number) =>
      post<{ id: number; allocation_type: string }>(
        `${v1(co)}/sales-orders/${encodeURIComponent(orderNo)}/allocations/${allocId}/harden`, {}),
    listInvoices: (co: string, limit = 50, offset = 0, search = "", status = "") =>
      get<Invoice[]>(`${v1(co)}/invoices?${qs({ limit, offset, search, status: status || undefined })}`),
    pdf: (co: string, no: string) => pdfUrl(`${v1(co)}/sales-orders/${encodeURIComponent(no)}/pdf`),
    getInvoice: (co: string, no: string) =>
      get<InvoiceDetail>(`${v1(co)}/invoices/${encodeURIComponent(no)}`),
    invoicePdf: (co: string, no: string) => pdfUrl(`${v1(co)}/invoices/${encodeURIComponent(no)}/pdf`),
    cancelOrder: (co: string, no: string) =>
      post<{ order_no: string; status: string; allocations_released: number }>(
        `${v1(co)}/sales-orders/${encodeURIComponent(no)}/cancel`, {}),
    markPosted: (co: string, no: string) => patch<{ doc_no: string; posted: boolean }>(`${v1(co)}/invoices/${encodeURIComponent(no)}/posted`, {}),
    generateInvoice: (co: string, deliveryDoc: string, weight_basis: "theoretical" | "actual") =>
      post<{ invoice_no: string; net_gbp: number; total_gbp: number; line_count: number; weight_basis: string; variance_flag: boolean }>(
        `${v1(co)}/invoices/generate/${encodeURIComponent(deliveryDoc)}`, { weight_basis }),
    voidInvoice: (co: string, docNo: string) =>
      post<{ voided: string }>(`${v1(co)}/invoices/${encodeURIComponent(docNo)}/void`, {}),
  },
  soWizard: {
    createDraft: (co: string) =>
      post<{ order_no: string }>(`${v1(co)}/sales-orders/draft`, {}),
    patch: (co: string, no: string, body: WizardPatch) =>
      patch<{ order_no: string; net_gbp: number; vat_gbp: number; total_gbp: number; line_count: number | null }>(
        `${v1(co)}/sales-orders/${encodeURIComponent(no)}`, body),
    advance: (co: string, no: string, stage: number, stock_override_batches: string[] = []) =>
      post<AdvanceResult>(`${v1(co)}/sales-orders/${encodeURIComponent(no)}/advance`, { stage, stock_override_batches }),
    confirm: (co: string, no: string) =>
      post<{ order_no: string; status: string }>(`${v1(co)}/sales-orders/${encodeURIComponent(no)}/confirm`, {}),
    abandon: (co: string, no: string) =>
      post<{ order_no: string; status: string }>(`${v1(co)}/sales-orders/${encodeURIComponent(no)}/abandon`, {}),
    ackPdfUrl: (co: string, no: string) =>
      get<{ url: string }>(`${v1(co)}/sales-orders/${encodeURIComponent(no)}/ack-pdf`),
    extract: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const fd = new FormData(); files.forEach(f => fd.append("files", f))
      return fetch(`${BASE}${v1(co)}/sales-orders/extract`, { method: "POST", headers, body: fd }).then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
        return r.json() as Promise<{ customer_ref: string; delivery_date: string; lines: { description: string; qty: number | null; unit: string; notes: string }[] }>
      })
    },
    aiCapturePo: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const fd = new FormData(); files.forEach(f => fd.append("files", f))
      return fetch(`${BASE}${v1(co)}/sales-orders/ai-capture-po`, { method: "POST", headers, body: fd }).then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
        return r.json() as Promise<AiPoCapture>
      })
    },
  },
  customers: {
    list: (co: string, limit = 50, offset = 0, search = "") =>
      get<Customer[]>(`${v1(co)}/customers?${qs({ limit, offset, search })}`),
    get: (co: string, code: string) =>
      get<CustomerDetail>(`${v1(co)}/customers/${encodeURIComponent(code)}`),
    credit: (co: string, code: string) =>
      get<CreditStatus>(`${v1(co)}/customers/${encodeURIComponent(code)}/credit`),
    salespeople: (co: string) => get<{ id: string; name: string }[]>(`${v1(co)}/salespeople`),
    setSalesperson: (co: string, code: string, salesperson_id: string | null) =>
      post<{ ok: boolean }>(`${v1(co)}/customers/${encodeURIComponent(code)}/salesperson`, { salesperson_id }),
    patchCredit: (co: string, code: string, body: { credit_limit_gbp?: number; on_hold?: boolean; on_super_hold?: boolean; hold_reason?: string; payment_due_days?: number; terms?: string; notes?: string; accounting_ref?: string }) =>
      patch<{ account_code: string }>(`${v1(co)}/customers/${encodeURIComponent(code)}`, body),
    updateContact: (co: string, code: string, seq: 1 | 2, body: { name?: string; role?: string; email?: string; telephone?: string }) =>
      put<{ ok: boolean; seq: number }>(`${v1(co)}/customers/${encodeURIComponent(code)}/contacts/${seq}`, body),
    create: (co: string, body: object) =>
      post<{ account_code: string }>(`${v1(co)}/customers`, body),
    statement: (co: string, account: string, months = 12) =>
      get<{ invoices: StatementInvoice[]; payments: StatementPayment[] }>(
        `${v1(co)}/customers/${encodeURIComponent(account)}/statement?months=${months}`),
    statementPdf: (co: string, account: string, months = 12) =>
      pdfUrl(`${v1(co)}/customers/${encodeURIComponent(account)}/statement/pdf?months=${months}`),
    riskScore: (co: string, account: string) =>
      get<{ score: number; band: "green" | "amber" | "red"; factors: Record<string, unknown>; calculated_at: string | null }>(
        `${v1(co)}/customers/${encodeURIComponent(account)}/risk-score`),
    recalculateRiskScore: (co: string, account: string) =>
      post<{ score: number; band: "green" | "amber" | "red"; factors: Record<string, unknown>; calculated_at: string | null }>(
        `${v1(co)}/customers/${encodeURIComponent(account)}/risk-score/recalculate`, {}),
    extract: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const fd = new FormData(); files.forEach(f => fd.append("files", f))
      const r = await fetch(`${BASE}${v1(co)}/customers/extract`, { method: "POST", headers, body: fd })
      if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
      return r.json()
    },
  },
  assist: (co: string, messages: { role: "user" | "assistant"; content: string }[], screen?: string, wizard_mode?: string) =>
    post<AssistResponse>(`${v1(co)}/assist`, { messages, screen, wizard_mode }),
  me: {
    get: () => get<UserMe>(`/api/v1/me`),
    update: (body: Partial<UserMe>) => put<{ ok: boolean }>(`/api/v1/me`, body),
  },
  stock: {
    list: (co: string, f: StockFilters = {}) => {
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries({ limit: 50, offset: 0, ...f })) {
        if (v !== undefined && v !== "") p.set(k, String(v))
      }
      return get<StockItem[]>(`${v1(co)}/stock-items?${p.toString()}`)
    },
    get: (co: string, code: string) =>
      get<StockItemDetail>(`${v1(co)}/stock-items/${encodeURIComponent(code)}`),
    patch: (co: string, code: string, body: { cost_price?: number; sell_price?: number; list_price?: number; reorder_level?: number; reorder_qty?: number; status?: string }) =>
      patch<{ account_code: string }>(`${v1(co)}/stock-items/${encodeURIComponent(code)}`, body),
    create: (co: string, body: StockItemIn) =>
      post<{ account_code: string }>(`${v1(co)}/stock-items`, body),
    batches: (co: string, code: string) =>
      get<{ batches: StockItemBatch[]; legacy_batches: LegacyBatch[] }>(`${v1(co)}/stock-items/${encodeURIComponent(code)}/batches`),
    attributes: (co: string) => get<StockAttribute[]>(`${v1(co)}/attributes`),
    attributeReport: (co: string, by: "attribute_1" | "attribute_2" | "attribute_3" | "attribute_4") =>
      get<{ value: string; description: string | null; items: number; stock_qty: number }[]>(`${v1(co)}/reports/stock-attributes?by=${by}`),
    postTransaction: (co: string, body: object) =>
      post<{ id: number; txn_type: string; qty: string }>(`${v1(co)}/stock-transactions`, body),
    listTransactions: (co: string, itemId: number, limit = 50) =>
      get<{ id: number; txn_type: string; qty: string; unit: string | null; cert_ref: string | null; ref_doc_no: string | null; notes: string | null; created_at: string }[]>(
        `${v1(co)}/stock-transactions?stock_item_id=${itemId}&limit=${limit}`
      ),
    extract: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const fd = new FormData(); files.forEach(f => fd.append("files", f))
      const r = await fetch(`${BASE}${v1(co)}/stock-items/extract`, { method: "POST", headers, body: fd })
      if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
      return r.json()
    },
    resolve: (co: string, description: string) =>
      post<{ attrs: Record<string, unknown>; matches: { account_code: string; description_1: string | null; short_description: string | null; attribute_1: string | null; attribute_2: string | null; attribute_3: string | null; attribute_4: string | null; size_1_mm: number | null }[] }>(
        `${v1(co)}/stock-items/resolve`, { description }),
    nlSearch: (co: string, query: string) =>
      post<{ filters: Record<string, string>; interpreted: string; results: StockItem[]; count: number }>(
        `${v1(co)}/stock/natural-language-search`, { query }),
  },
  grn: {
    extract: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const form = new FormData()
      files.forEach(f => form.append("files", f))
      return fetch(`${BASE}${v1(co)}/grn/extract`, { method: "POST", headers, body: form }).then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
        type POData = { order_no: string; supplier_account: string; delivery_date_serial: number | null; lines: { stock_account_code: string; description: string; qty_ordered: number; qty_received: number; status: string }[] }
        const d = await r.json() as { error?: string; extracted: Record<string, unknown>; ai_raw_text: string; cert_paths: string[]; conformance: ConformanceRow[]; suggested_po: POData | null; po_candidates: POData[]; duplicate_dn: boolean }
        if (d.error) throw new Error(d.error)
        return d
      })
    },
    create: (co: string, body: object) =>
      post<{ grn_no: string; id: number; batch_no: string | null; delivery_advisory: { status: string; ordered: number; received_total: number; outstanding: number } | null }>(`${v1(co)}/grn`, body),
    list: (co: string, search = "", accountCode = "") =>
      get<{ grn_no: string; supplier_account: string | null; supplier_name: string | null; purchase_order_no: string | null; stock_account_code: string | null; quantity: number | null; unit: string | null; cert_ref: string | null; heat_no: string | null; spec: string | null; grade: string | null; price_gbp: number | null; price_basis: string | null; warehouse: string | null; confirmed_at: string | null; created_at: string; cert_count: number; conformance_pass: boolean | null }[]>(
        `${v1(co)}/grn?${qs({ search: search || undefined, account_code: accountCode || undefined })}`
      ),
    get: (co: string, grnNo: string) =>
      get<{ grn_no: string; supplier_account: string | null; purchase_order_no: string | null; delivery_note_ref: string | null; stock_account_code: string | null; quantity: number | null; unit: string | null; length_mm: number | null; cert_ref: string | null; heat_no: string | null; spec: string | null; grade: string | null; cert_standard: string | null; price_gbp: number | null; price_basis: string | null; alloy_surcharge_pence: number | null; warehouse: string | null; chemistry: Record<string,number> | null; mechanical: Record<string,number> | null; conformance: ConformanceRow[] | null; cert_paths: string[] | null; confirmed_at: string | null; created_at: string; manufacturer_account: string | null; manufacturer_name: string | null; country_of_origin: string | null; linked_batch_no: string | null }>(
        `${v1(co)}/grn/${encodeURIComponent(grnNo)}`
      ),
    certs: (co: string, grnNo: string) =>
      get<{ path: string; url: string }[]>(`${v1(co)}/grn/${encodeURIComponent(grnNo)}/certs`),
  },
  batches: {
    list: (co: string, filters: BatchFilters = {}) => {
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== "" && v !== false) p.set(k, String(v))
      }
      const q = p.toString()
      return get<StockBatch[]>(`${v1(co)}/stock-batches${q ? "?" + q : ""}`)
    },
    get: (co: string, batchNo: string) =>
      get<StockBatchDetail>(`${v1(co)}/stock-batches/${encodeURIComponent(batchNo)}`),
    split: (co: string, batchNo: string, body: { qty_cut: number; length_mm?: number; warehouse?: string }) =>
      post<{ batch_no: string; id: number }>(`${v1(co)}/stock-batches/${encodeURIComponent(batchNo)}/split`, body),
    transfer: (co: string, batchNo: string, to_warehouse: string) =>
      post<{ batch_no: string; warehouse: string }>(`${v1(co)}/stock-batches/${encodeURIComponent(batchNo)}/transfer`, { to_warehouse }),
    adjust: (co: string, batchNo: string, new_qty: number, notes?: string, ref_doc_no?: string) =>
      post<{ batch_no: string; qty_available: number; delta: number }>(
        `${v1(co)}/stock-batches/${encodeURIComponent(batchNo)}/adjust`, { new_qty, notes, ref_doc_no }),
    setStatus: (co: string, batchNo: string, status: "available" | "quarantine" | "on_hold", reason?: string) =>
      post<{ batch_no: string; status: string }>(`${v1(co)}/stock-batches/${encodeURIComponent(batchNo)}/status`, { status, reason }),
    summary: (co: string) => get<StockSummaryRow[]>(`${v1(co)}/stock-summary`),
    remnantRecommendations: (co: string, stock_account_code: string, cut_length_mm: number, saw_type_id?: number, heat_no?: string) =>
      get<{ min_length_mm: number; kerf_mm: number; facing_allowance_mm: number; recommendations: { batch_no: string; heat_no: string; grade: string | null; length_mm: number; weight_theoretical_kg: number | null; warehouse: string | null; waste_pct: number; age_days: number; tail_offcut_mm: number; same_heat: boolean }[] }>(
        `${v1(co)}/stock/remnant-recommendations?${qs({ stock_account_code, cut_length_mm, saw_type_id, heat_no })}`),
  },
  quotes: {
    list: (co: string, search = "", status = "") => get<Quote[]>(`${v1(co)}/quotes?${qs({ search: search || undefined, status: status || undefined })}`),
    get: (co: string, no: string) => get<QuoteDetail>(`${v1(co)}/quotes/${encodeURIComponent(no)}`),
    pdf: (co: string, no: string) => pdfUrl(`${v1(co)}/quotes/${encodeURIComponent(no)}/pdf`),
    create: (co: string, body: object) =>
      post<{ quote_no: string; net_gbp: number; total_gbp: number; line_count: number }>(`${v1(co)}/quotes`, body),
    convert: (co: string, no: string) =>
      post<{ quote_no: string; order_no: string }>(`${v1(co)}/quotes/${encodeURIComponent(no)}/convert`, {}),
    setStatus: (co: string, no: string, status: "rejected" | "expired") =>
      patch<{ quote_no: string; status: string }>(`${v1(co)}/quotes/${encodeURIComponent(no)}/status`, { status }),
    extract: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const form = new FormData()
      files.forEach(f => form.append("files", f))
      return fetch(`${BASE}${v1(co)}/quotes/extract`, { method: "POST", headers, body: form }).then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
        return r.json() as Promise<{ extracted: { customer_ref?: string; contact?: string; lines: QuoteExtractLine[] }; ai_raw_text: string }>
      })
    },
  },
  dashboard: {
    get: (co: string) => get<DashboardSummary>(`${v1(co)}/dashboard`),
    woReport: (co: string) => get<WOReportRow[]>(`${v1(co)}/reports/works-orders`),
    creditHolds: (co: string) => get<CreditHoldRow[]>(`${v1(co)}/reports/credit-holds`),
    agedDebtors: (co: string) => get<AgedDebtorRow[]>(`${v1(co)}/reports/aged-debtors`),
  },
  finance: {
    recordPayment: (co: string, body: { customer_account: string; amount_gbp: number; method?: string; reference?: string; allocations?: { invoice_no: string; amount_gbp: number }[] }) =>
      post<{ payment_no: string; allocated_count: number }>(`${v1(co)}/payments`, body),
    creditNote: (co: string, invoiceNo: string, reason?: string) =>
      post<{ credit_note_no: string; invoice_no: string }>(`${v1(co)}/credit-notes/generate/${encodeURIComponent(invoiceNo)}`, { reason }),
    listCreditNotes: (co: string, invoiceNo: string) =>
      get<{ credit_note_no: string; reason: string | null; net_gbp: number; vat_gbp: number; total_gbp: number; status: string | null; created_at: string }[]>(`${v1(co)}/credit-notes/${encodeURIComponent(invoiceNo)}`),
    listPayments: (co: string, opts: { customerAccount?: string; invoiceNo?: string; limit?: number } = {}) =>
      get<{ payment_no: string; customer_account: string; customer_name: string | null; amount_gbp: number; method: string | null; reference: string | null; created_at: string }[]>(
        `${v1(co)}/payments?${qs({ customer_account: opts.customerAccount || undefined, invoice_no: opts.invoiceNo || undefined, limit: opts.limit ?? 50 })}`
      ),
    backToBack: (co: string, orderNo: string, lineNo: number, supplier_account?: string) =>
      post<{ po_no: string; order_no: string; line_no: number }>(`${v1(co)}/sales-orders/${encodeURIComponent(orderNo)}/lines/${lineNo}/back-to-back`, { supplier_account }),
  },
  admin: {
    auditLog: (filters: { table_name?: string; record_id?: string; limit?: number } = {}) => {
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries(filters)) if (v) p.set(k, String(v))
      const q = p.toString()
      return get<AuditEntry[]>(`/api/v1/admin/audit-log${q ? "?" + q : ""}`)
    },
    users: (company: string) => get<Member[]>(`/api/v1/admin/users?company=${encodeURIComponent(company)}`),
    invite: (company: string, email: string, role: string) =>
      post<{ id: number; email: string; role: string; status: string }>(`/api/v1/admin/users/invite`, { company, email, role }),
    setRole: (membership_id: number, role: string) => post(`/api/v1/admin/users/role`, { membership_id, role }),
    setStatus: (membership_id: number, status: string) => post(`/api/v1/admin/users/status`, { membership_id, status }),
    settings: (company: string) => get<Setting[]>(`/api/v1/admin/settings?company=${encodeURIComponent(company)}`),
    putSetting: (company: string, key: string, value: string) => put(`/api/v1/admin/settings`, { company, key, value }),
  },
  workOrders: {
    list: (co: string, status?: string) =>
      get<WorkOrder[]>(`${v1(co)}/works-orders${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    get: (co: string, no: string) => get<WorkOrderDetail>(`${v1(co)}/works-orders/${encodeURIComponent(no)}`),
    create: (co: string, body: object) =>
      post<{ wo_no: string; theoretical_yield_pct: number | null }>(`${v1(co)}/works-orders`, body),
    complete: (co: string, no: string) =>
      post<{ wo_no: string; bars_used: number; yield_pct: number; products: { length_mm: number; qty: number }[]; remnants: { length_mm: number; qty: number }[]; weight_scrap_kg: number }>(
        `${v1(co)}/works-orders/${encodeURIComponent(no)}/complete`, {}),
    setStatus: (co: string, no: string, status: string) =>
      post<{ wo_no: string; status: string }>(`${v1(co)}/works-orders/${encodeURIComponent(no)}/status`, { status }),
    nestingImport: (co: string, no: string, body: { utilisation_pct: number; sheets_used: number; remnants?: unknown[]; notes?: string }) =>
      post<{ wo_no: string; nesting_result_data: unknown; nesting_imported_at: string }>(
        `${v1(co)}/works-orders/${encodeURIComponent(no)}/nesting-import`, body),
  },
  mtcs: {
    list: (co: string, opts: { heat_number?: string; search?: string; unmatched?: boolean } = {}) => {
      const p = new URLSearchParams()
      if (opts.heat_number) p.set("heat_number", opts.heat_number)
      if (opts.search) p.set("search", opts.search)
      if (opts.unmatched) p.set("unmatched", "true")
      const q = p.toString()
      return get<Mtc[]>(`${v1(co)}/mtcs${q ? "?" + q : ""}`)
    },
    get: (co: string, id: number) => get<MtcDetail>(`${v1(co)}/mtcs/${id}`),
    certs: (co: string, id: number) =>
      get<{ path: string; url: string }[]>(`${v1(co)}/mtcs/${id}/certs`),
    verify: (co: string, id: number, verified_by?: string) =>
      post<{ id: number; verified_at: string; verified_by: string | null }>(
        `${v1(co)}/mtcs/${id}/verify`, { verified_by }),
    match: (co: string, id: number, batch_no: string, is_primary = false) =>
      post<{ batch_id: number; mtc_id: number; is_primary: boolean }>(
        `${v1(co)}/mtcs/${id}/match`, { batch_no, is_primary }),
    aiExtract: (co: string, id: number) =>
      post<MtcAiExtraction>(`${v1(co)}/mtcs/${id}/ai-extract`, {}),
    aiConfirm: (co: string, id: number, fields: Record<string, unknown>, confirmed_by?: string) =>
      post<{ ok: boolean; fields_applied: string[] }>(`${v1(co)}/mtcs/${id}/ai-confirm`, { fields, confirmed_by }),
  },
  gradeReference: {
    list: (co: string, opts: { search?: string; family?: string } = {}) => {
      const p = new URLSearchParams()
      if (opts.search) p.set("search", opts.search)
      if (opts.family) p.set("family", opts.family)
      const q = p.toString()
      return get<GradeRefRow[]>(`${v1(co)}/grade-reference${q ? "?" + q : ""}`)
    },
    get: (co: string, werkstoff: string) =>
      get<GradeRefDetail>(`${v1(co)}/grade-reference/${encodeURIComponent(werkstoff)}`),
    substitutes: (co: string, werkstoff: string) =>
      get<GradeSubstitute[]>(`${v1(co)}/grade-reference/${encodeURIComponent(werkstoff)}/substitutes`),
    datasheet: (co: string, werkstoff: string) =>
      pdfUrl(`${v1(co)}/grade-reference/${encodeURIComponent(werkstoff)}/datasheet`),
    finishes: (co: string) => get<SurfaceFinish[]>(`${v1(co)}/surface-finishes`),
  },
  contractReview: {
    get: (co: string, no: string) =>
      get<ContractReview | null>(`${v1(co)}/sales-orders/${encodeURIComponent(no)}/contract-review`),
    extract: async (co: string, no: string,
                    opts: { files?: File[]; useWizardPo?: boolean; manual?: boolean }) => {
      const headers = await authHeader()
      const fd = new FormData()
      ;(opts.files ?? []).forEach(f => fd.append("files", f))
      if (opts.useWizardPo) fd.append("use_wizard_po", "true")
      if (opts.manual) fd.append("manual", "true")
      return fetch(`${BASE}${v1(co)}/sales-orders/${encodeURIComponent(no)}/contract-review/extract`,
        { method: "POST", headers, body: fd }).then(async r => {
          if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
          return r.json() as Promise<ContractReview>
        })
    },
    signOff: (co: string, no: string, override_note?: string) =>
      post<ContractReview>(
        `${v1(co)}/sales-orders/${encodeURIComponent(no)}/contract-review/sign-off`, { override_note }),
  },
  dispatch: {
    create: (co: string, body: { sales_order_no: string; lines: object[] }) =>
      post<{ doc_no: string; order_no: string; line_count: number; net_gbp: number }>(
        `${v1(co)}/dispatch`, body
      ),
    list: (co: string, search = "", hideVoided = true, limit = 100) => get<DeliveryNote[]>(`${v1(co)}/delivery-notes?${qs({ search: search || undefined, hide_voided: hideVoided, limit })}`),
    despatchOrder: (co: string, orderNo: string, body: { weighbridge_gross_kg?: number; weighbridge_tare_kg?: number; weighbridge_slip_ref?: string; override?: boolean }) =>
      post<{ doc_no: string; line_count: number; weight_theoretical_kg: number; weighbridge_net_kg: number | null }>(
        `${v1(co)}/sales-orders/${encodeURIComponent(orderNo)}/despatch`, body),
    getNote: (co: string, doc: string) => get<DeliveryNoteDetail>(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}`),
    notePdf: (co: string, doc: string) => pdfUrl(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/pdf`),
    recordPod: (co: string, doc: string, body: { received_by_name: string; pod_notes?: string; exceptions_noted?: string }) =>
      post<{ doc_no: string; status: string; auto_invoice_no: string | null }>(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/pod`, body),
    recordPodException: (co: string, doc: string, body: { dl_line_no?: number; exception_type: string; qty_short?: number; notes?: string; raised_by?: string }) =>
      post<{ id: number; doc_no: string; exception_type: string }>(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/pod-exceptions`, body),
    confirm: (co: string, doc: string) =>
      post<{ doc_no: string; status: string; cert_pack_pdf_path: string | null; email_prepared_to: string[] }>(
        `${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/confirm`, {}),
    certPackUrl: (co: string, doc: string) =>
      get<{ url: string }>(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/cert-pack-pdf`),
    stockDespatchHistory: (co: string, code: string) =>
      get<{ doc_no: string; date: string | null; customer_account: string | null; customer_name: string | null; sales_order_no: string | null; qty: number | null; weight_theoretical_kg: number | null }[]>(
        `${v1(co)}/stock/${encodeURIComponent(code)}/despatch-history`),
  },
  despatchChecks: {
    readiness: (co: string, sales_order_no: string, line_nos?: number[]) =>
      post<{ lines: ReadinessLine[] }>(`${v1(co)}/despatch/readiness-check`, { sales_order_no, line_nos }),
    certValidation: (co: string, doc: string) =>
      post<{ pass: boolean; lines: CertCheckLine[] }>(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/cert-validation`, {}),
    certOverride: (co: string, doc: string, reason: string) =>
      post<{ overridden: boolean; doc_no: string }>(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/cert-validation/override`, { reason }),
    voidDn: (co: string, doc: string, reason: string) =>
      post<{ doc_no: string; status: string }>(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/void`, { reason }),
  },
  fleet: {
    vehicles: (co: string) => get<Vehicle[]>(`${v1(co)}/fleet/vehicles`),
    createVehicle: (co: string, body: {
      registration: string; vehicle_type?: string; max_payload_kg?: number; bed_length_mm?: number
      mot_expiry?: string; insurance_expiry?: string; service_due_date?: string; is_active?: boolean; notes?: string
    }) => post<{ id: number; registration: string }>(`${v1(co)}/fleet/vehicles`, body),
    drivers: (co: string) => get<Driver[]>(`${v1(co)}/fleet/drivers`),
    createDriver: (co: string, body: {
      first_name: string; last_name: string; licence_number?: string; licence_categories?: string[]
      licence_expiry?: string; cpc_expiry?: string; is_active?: boolean; notes?: string
    }) => post<{ id: number; first_name: string; last_name: string }>(`${v1(co)}/fleet/drivers`, body),
    updateVehicle: (co: string, id: number, body: {
      registration: string; vehicle_type?: string | null; max_payload_kg?: number | null; bed_length_mm?: number | null
      mot_expiry?: string | null; insurance_expiry?: string | null; service_due_date?: string | null; is_active?: boolean; notes?: string | null
    }) => patch<{ id: number }>(`${v1(co)}/fleet/vehicles/${id}`, body),
    updateDriver: (co: string, id: number, body: {
      first_name: string; last_name: string; licence_number?: string | null; licence_categories?: string[] | null
      licence_expiry?: string | null; cpc_expiry?: string | null; is_active?: boolean; notes?: string | null
    }) => patch<{ id: number }>(`${v1(co)}/fleet/drivers/${id}`, body),
    complianceAlerts: (co: string) =>
      get<{ vehicles: Vehicle[]; drivers: Driver[] }>(`${v1(co)}/fleet/compliance-alerts`),
  },
  terms: {
    list: (co: string, terms_type?: string, active_only = true) =>
      get<TermsDocument[]>(`${v1(co)}/terms-documents?${qs({ ...(terms_type ? { terms_type } : {}), active_only: active_only ? "true" : "false" })}`),
    get: (co: string, id: number) =>
      get<TermsDocumentDetail>(`${v1(co)}/terms-documents/${id}`),
    create: (co: string, body: { terms_type: string; version: string; title?: string; content_text?: string; effective_date?: string }) =>
      post<{ id: number; version: string; effective_date: string | null }>(`${v1(co)}/terms-documents`, body),
    recordAcceptance: (co: string, body: { customer_account: string; terms_id: number; accepted_by?: string; method?: string; notes?: string }) =>
      post<{ id: number; customer_account: string; accepted_at: string }>(`${v1(co)}/terms-acceptance`, body),
    customerStatus: (co: string, account_code: string) =>
      get<CustomerTermsStatus>(`${v1(co)}/customers/${encodeURIComponent(account_code)}/terms-status`),
  },
  suppliers: {
    list: (co: string, search = "", approved_only = false) =>
      get<Supplier[]>(`${v1(co)}/suppliers?${qs({ search, ...(approved_only ? { approved_only: "true" } : {}) })}`),
    get: (co: string, code: string) =>
      get<SupplierDetail>(`${v1(co)}/suppliers/${encodeURIComponent(code)}`),
    create: (co: string, body: object) =>
      post<{ account_code: string }>(`${v1(co)}/suppliers`, body),
    update: (co: string, code: string, body: object) =>
      patch<{ ok: boolean; account_code: string }>(`${v1(co)}/suppliers/${encodeURIComponent(code)}`, body),
    updateContact: (co: string, code: string, seq: 1 | 2, body: { name?: string; role?: string; email?: string; telephone?: string }) =>
      put<{ ok: boolean; seq: number }>(`${v1(co)}/suppliers/${encodeURIComponent(code)}/contacts/${seq}`, body),
    performance: (co: string) =>
      get<SupplierPerformance[]>(`${v1(co)}/reports/supplier-performance`),
    extract: async (co: string, files: File[]) => {
      const headers = await authHeader()
      const form = new FormData()
      files.forEach(f => form.append("files", f))
      return fetch(`${BASE}${v1(co)}/suppliers/extract`, { method: "POST", headers, body: form }).then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
        return r.json() as Promise<Record<string, string>>
      })
    },
  },
  loads: {
    create: (co: string, body: { vehicle_id?: number; driver_id?: number; planned_departure?: string; route_description?: string }) =>
      post<{ load_id: number; load_reference: string }>(`${v1(co)}/despatch/loads`, body),
    list: (co: string) => get<Load[]>(`${v1(co)}/despatch/loads`),
    assign: (co: string, id: number, body: { doc_nos: string[]; stop_sequence?: unknown[] }) =>
      patch<{ load_id: number; assigned: number; weight_total_theoretical_kg: number | null }>(`${v1(co)}/despatch/loads/${id}/assign`, body),
    confirm: (co: string, id: number) =>
      post<{ load_id: number; status: string }>(`${v1(co)}/despatch/loads/${id}/confirm`, {}),
    depart: (co: string, id: number) =>
      post<{ load_id: number; status: string }>(`${v1(co)}/despatch/loads/${id}/depart`, {}),
    weighbridge: (co: string, doc: string, body: { tare_kg: number; gross_kg: number; slip_ref?: string }) =>
      post<{ net_kg: number; variance_pct: number; band: string }>(`${v1(co)}/delivery-notes/${encodeURIComponent(doc)}/weighbridge`, body),
  },
  reports: {
    otif: (co: string, months = 6) =>
      get<{ by_customer: OTIFCustomerRow[]; by_month: OTIFMonthRow[]; months: number }>(
        `${v1(co)}/reports/otif?months=${months}`),
    stockTurn: (co: string, months = 12) =>
      get<StockTurnRow[]>(`${v1(co)}/reports/stock-turn?months=${months}`),
    margins: (co: string) => get<MarginRow[]>(`${v1(co)}/reports/margins`),
    stockValuation: (co: string) => get<StockValuationRow[]>(`${v1(co)}/reports/stock-valuation`),
    lowStock: (co: string) => get<LowStockRow[]>(`${v1(co)}/reports/low-stock`),
    stockAge: (co: string) => get<StockAgeRow[]>(`${v1(co)}/reports/stock-age`),
    overdueInvoices: (co: string, days = 30) => get<OverdueInvoiceRow[]>(`${v1(co)}/reports/overdue-invoices?days=${days}`),
    apRegister: (co: string, status = "") => get<APRegisterRow[]>(`${v1(co)}/reports/ap-register?status=${encodeURIComponent(status)}`),
    salesPerf: (co: string, months = 12) => get<SalesPerfRow[]>(`${v1(co)}/reports/sales-performance?months=${months}`),
    supplierSpend: (co: string, months = 12) => get<SupplierSpendRow[]>(`${v1(co)}/reports/supplier-spend?months=${months}`),
    salespersonPerf: (co: string, months = 12) => get<SalespersonPerfRow[]>(`${v1(co)}/reports/salesperson-performance?months=${months}`),
    monthlyRevenue: (co: string, months = 12) => get<MonthlyRevenueRow[]>(`${v1(co)}/reports/monthly-revenue?months=${months}`),
    outstandingLines: (co: string) => get<OutstandingLineRow[]>(`${v1(co)}/reports/outstanding-lines`),
    outstandingPOLines: (co: string) => get<OutstandingPOLineRow[]>(`${v1(co)}/reports/outstanding-po-lines`),
  },
  demand: {
    forecast: (co: string, stockCode: string) =>
      get<DemandForecast>(`${v1(co)}/stock/demand-forecast/${encodeURIComponent(stockCode)}`),
    suggestions: (co: string, status?: string) =>
      get<DemandSuggestion[]>(`${v1(co)}/demand/suggestions${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    accept: (co: string, id: number, po_no?: string) =>
      post<{ ok: boolean }>(`${v1(co)}/demand/suggestions/${id}/accept`, { po_no }),
    reject: (co: string, id: number, reason: string) =>
      post<{ ok: boolean }>(`${v1(co)}/demand/suggestions/${id}/reject`, { reason }),
  },
  kpi: {
    alerts: (co: string, status?: string) =>
      get<KpiAlert[]>(`${v1(co)}/kpi/alerts${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    recalculate: (co: string) =>
      post<{ recalculated: string[]; alerts_created: string[] }>(`${v1(co)}/kpi/recalculate`, {}),
    updateAlert: (co: string, id: number, status: string, investigation_notes?: string) =>
      patch<{ ok: boolean }>(`${v1(co)}/kpi/alerts/${id}`, { status, investigation_notes }),
  },
  fx: {
    listForwards: (co: string, status?: string) =>
      get<ForwardContract[]>(`${v1(co)}/fx/forward-contracts${status ? `?status=${encodeURIComponent(status)}` : ""}`),
    getForward: (co: string, no: string) =>
      get<ForwardContract>(`${v1(co)}/fx/forward-contracts/${encodeURIComponent(no)}`),
    createForward: (co: string, body: {
      currency_pair: string; direction: string; foreign_amount: number; contract_rate: number
      settlement_date: string; trade_date?: string; bank_reference?: string
      linked_po_no?: string; linked_so_no?: string; notes?: string; created_by?: string
    }) => post<{ id: number; contract_no: string; gbp_equivalent: number }>(`${v1(co)}/fx/forward-contracts`, body),
    settle: (co: string, no: string, body: { realized_rate: number; settled_at?: string; notes?: string }) =>
      post<{ contract_no: string; status: string; realized_gain_loss_gbp: number }>(
        `${v1(co)}/fx/forward-contracts/${encodeURIComponent(no)}/settle`, body),
    cancel: (co: string, no: string) =>
      post<{ contract_no: string; status: string }>(`${v1(co)}/fx/forward-contracts/${encodeURIComponent(no)}/cancel`, {}),
    upsertRate: (co: string, body: { rate_date: string; quote_ccy: string; spot_rate: number; base_ccy?: string; source?: string }) =>
      post<CurrencyRate>(`${v1(co)}/fx/rates`, body),
    listRates: (co: string, ccy?: string, days = 30) =>
      get<CurrencyRate[]>(`${v1(co)}/fx/rates?days=${days}${ccy ? `&ccy=${encodeURIComponent(ccy)}` : ""}`),
  },
  shopFloor: {
    logEvents: async (co: string, events: SfEventIn[]) => {
      const headers = { ...await authHeader(), "Content-Type": "application/json" }
      return fetch(`${BASE}${v1(co)}/shop-floor/events`, {
        method: "POST", headers, body: JSON.stringify(events),
      }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<{ inserted: number }> })
    },
    wos: (co: string, status = "open") =>
      get<ShopFloorWo[]>(`${v1(co)}/shop-floor/works-orders?status=${encodeURIComponent(status)}`),
    wo: (co: string, no: string) =>
      get<ShopFloorWo>(`${v1(co)}/shop-floor/works-orders/${encodeURIComponent(no)}`),
    startDowntime: (co: string, body: { machine_id?: number; reason_code: string; wo_no?: string; operator?: string; notes?: string }) =>
      post<{ id: number; started_at: string }>(`${v1(co)}/shop-floor/downtime`, body),
    endDowntime: (co: string, id: number, notes?: string) =>
      patch<{ id: number; duration_mins: number }>(`${v1(co)}/shop-floor/downtime/${id}${notes ? `?notes=${encodeURIComponent(notes)}` : ""}`, {}),
    downtime: (co: string, active_only = false) =>
      get<DowntimeRecord[]>(`${v1(co)}/shop-floor/downtime?active_only=${active_only}`),
  },
  cutPricing: {
    sawTypes: (co: string, activeOnly = true) => get<SawType[]>(`${v1(co)}/saw-types?active_only=${activeOnly}`),
    createSawType: (co: string, body: { name: string; kerf_mm: number; cost_per_cut?: number; is_active?: boolean }) =>
      post<{ id: number }>(`${v1(co)}/saw-types`, body),
    updateSawType: (co: string, id: number, body: { name?: string; kerf_mm?: number; cost_per_cut?: number; is_active?: boolean }) =>
      patch<{ id: number }>(`${v1(co)}/saw-types/${id}`, body),
    listRules: (co: string) => get<CutPricingRule[]>(`${v1(co)}/cut-pricing-rules`),
    createRule: (co: string, body: { stock_account_code?: string; facing_allowance_mm?: number; extra_loss_pct?: number; min_usable_length_mm?: number }) =>
      post<{ id: number }>(`${v1(co)}/cut-pricing-rules`, body),
    updateRule: (co: string, id: number, body: { facing_allowance_mm?: number; extra_loss_pct?: number; min_usable_length_mm?: number }) =>
      patch<{ id: number }>(`${v1(co)}/cut-pricing-rules/${id}`, body),
    calculate: (co: string, body: { stock_account_code: string; saw_type_id: number; cut_length_mm: number; qty: number; margin_pct: number }) =>
      post<CutPriceResult>(`${v1(co)}/cut-price/calculate`, body),
  },
  company: {
    logos: (co: string) => get<AccreditationLogo[]>(`${v1(co)}/company/logos`),
    uploadLogo: (co: string, file: File, display_name: string) => {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("display_name", display_name)
      return postForm<AccreditationLogo>(`${v1(co)}/company/logos`, fd)
    },
    updateLogo: (co: string, id: number, body: Partial<Pick<AccreditationLogo, "display_name" | "sort_order" | "is_active">>) =>
      patch<AccreditationLogo>(`${v1(co)}/company/logos/${id}`, body),
    deleteLogo: (co: string, id: number) => del<{ deleted: boolean }>(`${v1(co)}/company/logos/${id}`),
  },
  accounting: {
    unpostedSummary: (co: string) => get<UnpostedSummary>(`${v1(co)}/accounting/unposted-summary`),
    listRuns: (co: string) => get<PostingRun[]>(`${v1(co)}/accounting/posting-runs`),
    createRun: (co: string, body: { package: string; ledger: string }) => post<PostingRun>(`${v1(co)}/accounting/posting-runs`, body),
    csvUrl: (co: string, runId: number) => `${BASE}/api/v1/${co}/accounting/posting-runs/${runId}/csv`,
    confirm: (co: string, runId: number) => post<{ confirmed: number }>(`${v1(co)}/accounting/posting-runs/${runId}/confirm`, {}),
    voidRun: (co: string, runId: number) => post<{ voided: number }>(`${v1(co)}/accounting/posting-runs/${runId}/void`, {}),
  },
  stockAdjustments: {
    list: (co: string, batchId?: string) =>
      get<StockAdjustment[]>(`${v1(co)}/stock/adjustments${batchId ? `?batch_id=${encodeURIComponent(batchId)}` : ""}`),
    create: (co: string, body: {
      batch_id: string; adjustment_type: string
      old_values: Record<string, unknown>; new_values: Record<string, unknown>
      reason_code: string; reason_notes?: string
    }) => post<StockAdjustment>(`${v1(co)}/stock/adjustments`, body),
    reverse: (co: string, adjId: number) =>
      post<StockAdjustment>(`${v1(co)}/stock/adjustments/${adjId}/reverse`, {}),
  },
  scrap: {
    holdings: (co: string) => get<ScrapHolding[]>(`${v1(co)}/scrap/holdings`),
    disposals: (co: string) => get<ScrapDisposal[]>(`${v1(co)}/scrap/disposals`),
    recordDisposal: (co: string, body: {
      scrap_merchant: string; material_type: string
      weight_kg: number; price_per_tonne: number; notes?: string
    }) => post<ScrapDisposal>(`${v1(co)}/scrap/disposals`, body),
  },
  subcontracts: {
    list: (co: string) => get<SubcontractOrder[]>(`${v1(co)}/subcontracts`),
    create: (co: string, body: {
      wo_id: number; supplier_id: number; operation_description?: string
      batch_ids_out?: string[]; expected_return_date?: string
      cost_agreed?: number; notes?: string
    }) => post<SubcontractOrder>(`${v1(co)}/subcontracts`, body),
    send: (co: string, id: number) => post<SubcontractOrder>(`${v1(co)}/subcontracts/${id}/send`, {}),
    return: (co: string, id: number, body: { passed: boolean; notes?: string }) =>
      post<SubcontractOrder>(`${v1(co)}/subcontracts/${id}/return`, body),
  },
  scheduling: {
    machines: (co: string) =>
      get<MachineRow[]>(`${v1(co)}/scheduling/machines`),
    schedule: (co: string, dateFrom?: string, dateTo?: string) => {
      const p = new URLSearchParams()
      if (dateFrom) p.set("date_from", dateFrom)
      if (dateTo) p.set("date_to", dateTo)
      return get<{ schedules: ScheduleEntry[]; booked: BookedSlot[]; date_from: string; date_to: string }>(
        `${v1(co)}/scheduling/schedule${p.toString() ? "?" + p : ""}`)
    },
    unscheduled: (co: string) =>
      get<UnscheduledWO[]>(`${v1(co)}/scheduling/unscheduled`),
    create: (co: string, body: {
      machine_id: number; wo_id?: number; scheduled_start: string; scheduled_end: string
      est_minutes?: number; notes?: string
    }) => post<ScheduleEntry>(`${v1(co)}/scheduling/schedule`, body),
    update: (co: string, id: number, body: {
      scheduled_start?: string; scheduled_end?: string; machine_id?: number; notes?: string
    }) => patch<ScheduleEntry>(`${v1(co)}/scheduling/schedule/${id}`, body),
    remove: (co: string, id: number) =>
      del(`${v1(co)}/scheduling/schedule/${id}`),
  },
  edi: {
    partners: (co: string) => get<EdiPartner[]>(`${v1(co)}/edi/trading-partners`),
    createPartner: (co: string, body: {
      partner_name: string; partner_id: string; standard?: string
      direction?: string; customer_account?: string; is_active?: boolean; notes?: string
    }) => post<EdiPartner>(`${v1(co)}/edi/trading-partners`, body),
    updatePartner: (co: string, id: number, body: {
      partner_name: string; partner_id: string; standard?: string; direction?: string
      customer_account?: string; is_active?: boolean; notes?: string
    }) => patch<EdiPartner>(`${v1(co)}/edi/trading-partners/${id}`, body),
    transactions: (co: string, status?: string, limit = 50) =>
      get<EdiTransaction[]>(`${v1(co)}/edi/transactions?${qs({ status, limit })}`),
    getTransaction: (co: string, id: number) =>
      get<EdiTransaction & { raw_content: string; parsed_content: unknown }>(`${v1(co)}/edi/transactions/${id}`),
    upload: async (co: string, file: File) => {
      const headers = await authHeader()
      const form = new FormData(); form.append("file", file)
      const r = await fetch(`${BASE}${v1(co)}/edi/inbound`, { method: "POST", headers, body: form })
      if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.detail ?? `${r.status}`) }
      return r.json() as Promise<{ tx_id: number; status: string; message_type: string; so_no?: string; line_count?: number }>
    },
    retry: (co: string, id: number) =>
      post<{ tx_id: number; status: string }>(`${v1(co)}/edi/transactions/${id}/retry`, {}),
  },

  grades: {
    list: (co: string) => get<GradeRow[]>(`${v1(co)}/grades`),
    upsert: (co: string, body: {
      grade_code: string; standard?: string; material_type?: string
      density?: number; min_cert_default?: string
    }) => post<GradeRow>(`${v1(co)}/grades`, body),
    delete: (co: string, grade_code: string) =>
      del(`${v1(co)}/grades/${encodeURIComponent(grade_code)}`),
    surcharges: (co: string) => get<SurchargeRow[]>(`${v1(co)}/grades/alloy-surcharges`),
    addSurcharge: (co: string, body: {
      grade_code: string; surcharge_per_tonne_pence: number; effective_from?: string
    }) => post<SurchargeRow>(`${v1(co)}/grades/alloy-surcharges`, body),
  },
  ncr: {
    list: (co: string, p: { status?: string; source?: string; assigned_to?: string } = {}) =>
      get<NcrRow[]>(`${v1(co)}/ncr?${qs(p as Record<string, string | undefined>)}`),
    get: (co: string, id: string) =>
      get<NcrRow>(`${v1(co)}/ncr/${id}`),
    create: (co: string, body: {
      source?: string; source_ref?: string; batch_id?: number; description: string; assigned_to?: string
    }) => post<NcrRow>(`${v1(co)}/ncr`, body),
    update: (co: string, id: string, body: {
      root_cause?: string; disposition?: string; rma_no?: string
      corrective_action?: string; assigned_to?: string; status?: string
    }) => patch<NcrRow>(`${v1(co)}/ncr/${id}`, body),
    close: (co: string, id: string) =>
      post<NcrRow>(`${v1(co)}/ncr/${id}/close`, {}),
  },
  adminCompanies: () => get<{ slug: string; name: string }[]>("/api/v1/admin/companies"),
  createCompany: (body: object) => post<{ slug: string; name: string }>("/api/v1/admin/companies", body),
  importCsv: async (company: string, entity: "customers" | "suppliers" | "stock-items", file: File) => {
    const fd = new FormData(); fd.append("file", file)
    const headers = await authHeader()
    return fetch(`${BASE}/api/v1/${company}/import/${entity}`, {
      method: "POST",
      headers,
      body: fd,
    }).then(r => r.json()) as Promise<{ imported: number; errors: { row: number; error: string }[] }>
  },
}

export type EdiPartner = {
  id: number; partner_name: string; partner_id: string
  standard: string; direction: string
  customer_account: string | null; customer_name: string | null
  is_active: boolean; notes: string | null; created_at: string
}

export type EdiTransaction = {
  id: number; partner_id: string; direction: string; message_type: string | null
  filename: string | null; status: string; error_message: string | null
  linked_so_no: string | null; processed_at: string | null; created_at: string
}

export type GradeRow = {
  grade_code: string; standard: string | null; material_type: string | null
  density: number | null; min_cert_default: string | null
  current_surcharge_pence: number | null
}

export type SurchargeRow = {
  id: number; grade_code: string
  surcharge_per_tonne_pence: number; effective_from: string
}

export type SubcontractOrder = {
  id: number; wo_id: number; supplier_id: number
  operation_description: string | null
  batch_ids_out: string[]
  send_date: string | null; expected_return_date: string | null; actual_return_date: string | null
  cost_agreed: number | null; cost_invoiced: number | null
  status: string; notes: string | null; created_by: string | null; created_at: string
  supplier_name?: string | null
}

export type ScrapHolding = { scrap_type: string; total_kg: number }
export type ScrapDisposal = {
  id: number; disposal_date: string; scrap_merchant: string
  material_type: string; weight_kg: number; price_per_tonne: number
  total_credit: number; notes: string | null; recorded_by: string | null; created_at: string
}

export type OutstandingLineRow = {
  order_no: string; customer_account: string; customer_name: string | null; customer_ref: string | null
  line_no: number; stock_account_code: string | null; short_description: string | null
  qty_ordered: number; qty_sent: number; qty_outstanding: number
  delivery_date: string | null; order_status: string | null
}

export type OutstandingPOLineRow = {
  order_no: string; supplier_account: string; supplier_name: string | null
  line_no: number; stock_account_code: string | null; description_1: string | null
  qty_ordered: number; qty_received: number; qty_outstanding: number
  delivery_date: string | null; po_status: string | null
}

export type MtcAiExtraction = {
  extracted: {
    cert_reference?: string; heat_number?: string; cert_type?: string; grade_code?: string
    standard?: string; material_description?: string; cert_date?: string; test_date?: string
    mill_name?: string; authorised_by?: string; inspected_by?: string; heat_treatment_condition?: string
    chemistry?: Record<string, number>; mechanical?: Record<string, number>
    confidence?: Record<string, number>; extraction_uncertain?: boolean
  }
  conformance: ConformanceRow[]
  extraction_uncertain: boolean
}

export type AiPoCaptureLine = {
  description: string
  grade: string | null; spec: string | null; product_form: string | null
  length_mm: number | null; width_mm: number | null; thickness_mm: number | null; diameter_mm: number | null
  qty: number | null; unit: string
  confidence: number
  stock_matches: { account_code: string; description_1: string | null; sim: number }[]
  top_match: string | null
  match_confidence: number
}
export type AiPoCapture = {
  draft_so: {
    customer_account: string | null
    customer_ref: string | null
    delivery_date: string | null
    lines: AiPoCaptureLine[]
  }
  confidence_per_field: Record<string, number>
  extraction_warnings: string[]
  customer_match: { account_code: string; name: string; sim: number } | null
}

export type DemandForecast = {
  stock_account_code: string
  history_months: number
  forecast_qty_30d: number | null
  confidence: "high" | "medium" | "low" | null
  free_stock_qty: number | null
  incoming_po_qty: number | null
  available_qty: number | null
  shortage_qty: number | null
  suggest_reorder: boolean
  pending_suggestion: { id: number; suggested_qty: number; status: string } | null
  history: { month: string; qty: number }[]
  message?: string
}

export type DemandSuggestion = {
  id: number
  stock_account_code: string
  suggested_qty: number | null
  current_stock_qty: number | null
  incoming_po_qty: number | null
  shortage_qty: number | null
  status: "pending" | "accepted" | "rejected"
  reject_reason: string | null
  accepted_po_no: string | null
  created_at: string
  forecast_qty: number | null
  confidence: "high" | "medium" | "low" | null
  history_events: number | null
}

export type ForwardContract = {
  id: number; contract_no: string
  currency_pair: string; direction: "buy" | "sell"
  foreign_amount: number; contract_rate: number; gbp_equivalent: number
  trade_date: string; settlement_date: string
  bank_reference: string | null; linked_po_no: string | null; linked_so_no: string | null
  status: "open" | "settled" | "cancelled"
  settled_at: string | null; realized_rate: number | null; realized_gain_loss_gbp: number | null
  notes: string | null; created_by: string | null; created_at: string
  latest_spot_rate: number | null; mtm_gain_loss_gbp: number | null
}

export type CurrencyRate = {
  rate_date: string; base_ccy: string; quote_ccy: string; spot_rate: number; source: string | null
}

export type SfEventIn = {
  event_type: string
  wo_no?: string; dn_no?: string; grn_no?: string; batch_no?: string
  operator?: string; machine_id?: number
  qty?: number; unit?: string; notes?: string
  photo_path?: string; device_id?: string
  event_at?: string
}

export type ShopFloorWo = {
  wo_no: string; status: string; machine_id: number | null; operation_type: string | null
  stock_account_code: string | null; parent_batch_no: string
  qty_available: string | null; unit: string | null; length_mm: string | null
  grade: string | null; spec: string | null
  cutting_list: { length_mm: number; qty: number }[] | null
  theoretical_yield_pct: number | null; created_at: string
  events?: { event_type: string; operator: string | null; qty: number | null; unit: string | null; notes: string | null; event_at: string; photo_path: string | null }[]
}

export type DowntimeRecord = {
  id: number; machine_id: number | null; reason_code: string; wo_no: string | null
  operator: string | null; notes: string | null
  started_at: string; ended_at: string | null; duration_mins: number | null
}

export type KpiAlert = {
  id: number
  metric: string
  alert_date: string
  current_value: number | null
  baseline_mean: number | null
  baseline_stddev: number | null
  z_score: number | null
  status: "open" | "acknowledged" | "resolved" | "dismissed"
  acknowledged_by: number | null
  acknowledged_at: string | null
  investigation_notes: string | null
  created_at: string
}

export type AccreditationLogo = {
  id: number
  file_path: string
  display_name: string
  sort_order: number
  is_active: boolean
}

export type PostingRun = {
  id: number
  run_date: string
  package: string
  ledger: string
  status: string
  tx_count: number
  net_total: number   // pence
  file_ref: string | null
  created_by: string | null
  created_at: string
}

export type UnpostedSummary = {
  invoices: { count: number; net_gbp: number }
  credit_notes: { count: number; net_gbp: number }
}

export type StockAdjustment = {
  id: number
  batch_id: string
  adjustment_type: string
  old_values: Record<string, unknown>
  new_values: Record<string, unknown>
  reason_code: string
  reason_notes: string | null
  requested_by: string | null
  authorised_by: string | null
  posted_at: string
  reversal_of_adjustment_id: number | null
}

export type MachineRow = {
  id: number
  code: string
  name: string | null
  machine_type: string | null
  max_length_mm: number | null
  is_active: boolean
}

export type ScheduleEntry = {
  id: number
  machine_id: number
  wo_id: number | null
  scheduled_start: string
  scheduled_end: string
  est_minutes: number | null
  notes: string | null
  machine_code: string
  machine_name: string | null
  wo_no: string | null
  operation_type: string | null
  wo_status: string | null
}

export type BookedSlot = {
  machine_id: number
  date: string
  booked_mins: number
  avail_mins: number
}

export type UnscheduledWO = {
  id: number
  wo_no: string
  operation_type: string | null
  status: string
  cutting_list: unknown
  batch_desc: string | null
  grade: string | null
}

export type NcrRow = {
  id: number
  subcontract_id: number | null
  batch_id: number | null
  description: string
  raised_by: string | null
  raised_at: string
  status: string
  source: string
  source_ref: string | null
  assigned_to: string | null
  root_cause: string | null
  disposition: string | null
  rma_no: string | null
  corrective_action: string | null
  resolved_by: string | null
  resolved_at: string | null
  // joined
  batch_no: string | null
  batch_description: string | null
  grade: string | null
}

