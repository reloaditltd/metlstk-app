import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  CustomerList, CustomerDetail, CustomerNew,
  PurchaseOrderList, PurchaseOrderDetail, PONew,
  SalesOrderList, SalesOrderDetail, SalesOrderNew,
  InvoiceList, InvoiceDetail,
  StockList, StockDetail, StockNew,
  DispatchView,
  GRNList, GRNNew, GRNDetail,
  StockBatchList, StockBatchDetail,
  MTCList, MTCDetail,
  QuoteList, QuoteNew, QuoteDetail,
  WorkOrderList, WorkOrderNew, WorkOrderDetail,
  DeliveryNoteList, DeliveryNoteDetail,
  LoadList,
  Dashboard, AgedDebtors, OTIFReport, StockTurnReport, MarginsReport, StockValuationReport, StockMixReport, LowStockReport, StockAgeReport, OverdueInvoicesReport, SalesPerfReport, SalespersonPerfReport, MonthlyRevenueReport, CustomerStatement, APRegister, SupplierSpendReport, OutstandingLinesReport, OutstandingPOLinesReport, AuditLog, AdminUsers, UserProfile,
  Fleet,
  SupplierList, SupplierDetailView, SupplierNew, SupplierPerformanceReport,
  TermsView,
  KpiAlertBell,
  FxView,
  BrandingView,
  AccountingView,
  StockAdjustmentsView,
  ScrapDashboard,
  SubcontractsView,
  RemnantRegister,
  ProductionSchedule,
  EdiView,
  GradeRegisterView,
  GradeReferenceList, GradeReferenceDetail,
  NCRList, NCRDetail,
  ImportView,
  ImportSection, CSV_IMPORT_HEADERS,
  PortalApp,
} from "./views"
import { AssistPanel } from "./components/AssistPanel"
import { useSession, LoginPage } from "./auth"
import { supabase } from "./supabase"
import { api } from "./api"
import PwaShell from "./Pwa"

type CoEntry = { slug: string; name: string }

// ── CSV template helper ───────────────────────────────────────────────────────
// ── New Company Wizard ────────────────────────────────────────────────────────
function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/^_+/, "")
}

function NewCompanyWizard({ onClose, onDone }: { onClose: () => void; onDone: (co: CoEntry) => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    slug: "", company_name: "", address_line_1: "", address_line_2: "",
    postcode: "", telephone: "", email: "", vat_number: "", company_reg: "",
    bank_name: "", bank_sort_code: "", bank_account_no: "", payment_terms: "30 days net",
  })
  const [error, setError] = useState("")
  const [createdSlug, setCreatedSlug] = useState("")

  function set(k: string, v: string) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === "company_name" && !f.slug) next.slug = toSlug(v)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStep(2); setError("")
    try {
      const result = await api.createCompany(form)
      setCreatedSlug(result.slug)
      setStep(3)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create company")
    }
  }

  const modal = (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "var(--color-surface)", borderRadius: "8px", padding: "2rem", width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
        <button type="button" className="modal-close" style={{ position: "absolute", top: "1rem", right: "1rem" }} onClick={onClose}>×</button>
        {step === 1 && (
          <form onSubmit={submit}>
            <h2 style={{ marginBottom: "1.2rem" }}>New company</h2>
            <div className="form-row"><label>Company name *<input className="form-input" required value={form.company_name} onChange={e => set("company_name", e.target.value)} /></label></div>
            <div className="form-row"><label>Slug *<input className="form-input" required pattern="^[a-z][a-z0-9_]{1,62}$" value={form.slug} onChange={e => set("slug", e.target.value)} /></label></div>
            <div className="form-row"><label>Address line 1<input className="form-input" value={form.address_line_1} onChange={e => set("address_line_1", e.target.value)} /></label></div>
            <div className="form-row"><label>Address line 2<input className="form-input" value={form.address_line_2} onChange={e => set("address_line_2", e.target.value)} /></label></div>
            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" }}>
              <label>Postcode<input className="form-input" value={form.postcode} onChange={e => set("postcode", e.target.value)} /></label>
              <label>Telephone<input className="form-input" value={form.telephone} onChange={e => set("telephone", e.target.value)} /></label>
            </div>
            <div className="form-row"><label>Email<input className="form-input" type="email" value={form.email} onChange={e => set("email", e.target.value)} /></label></div>
            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" }}>
              <label>VAT number<input className="form-input" value={form.vat_number} onChange={e => set("vat_number", e.target.value)} /></label>
              <label>Company reg<input className="form-input" value={form.company_reg} onChange={e => set("company_reg", e.target.value)} /></label>
            </div>
            <div className="form-row"><label>Payment terms<input className="form-input" value={form.payment_terms} onChange={e => set("payment_terms", e.target.value)} /></label></div>
            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: ".5rem" }}>
              <label>Bank name<input className="form-input" value={form.bank_name} onChange={e => set("bank_name", e.target.value)} /></label>
              <label>Sort code<input className="form-input" value={form.bank_sort_code} onChange={e => set("bank_sort_code", e.target.value)} /></label>
              <label>Account no<input className="form-input" value={form.bank_account_no} onChange={e => set("bank_account_no", e.target.value)} /></label>
            </div>
            <button type="submit" className="btn" style={{ marginTop: "1rem", width: "100%" }}>Create company →</button>
          </form>
        )}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <div className="spinner" style={{ margin: "0 auto 1rem" }} />
            <p>Creating company schema… this takes about 30 seconds</p>
            {error && <p style={{ color: "var(--color-error, red)", marginTop: "1rem" }}>{error}</p>}
            {error && <button type="button" className="btn btn-secondary" style={{ marginTop: ".5rem" }} onClick={() => setStep(1)}>← Back</button>}
          </div>
        )}
        {step === 3 && (
          <div>
            <h2 style={{ marginBottom: "1rem" }}>Import data (optional)</h2>
            <ImportSection compact company={createdSlug} entity="customers" label="Customers" header={CSV_IMPORT_HEADERS.customers} />
            <ImportSection compact company={createdSlug} entity="suppliers" label="Suppliers" header={CSV_IMPORT_HEADERS.suppliers} />
            <ImportSection compact company={createdSlug} entity="stock-items" label="Stock items" header={CSV_IMPORT_HEADERS["stock-items"]} />
            <button type="button" className="btn" style={{ marginTop: ".5rem" }} onClick={() => setStep(4)}>Finish →</button>
          </div>
        )}
        {step === 4 && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <h2>{form.company_name} is ready!</h2>
            <p style={{ margin: "1rem 0" }}>Your new company has been set up.</p>
            <button type="button" className="btn" onClick={() => {
              onDone({ slug: createdSlug, name: form.company_name })
              window.location.hash = `#/${createdSlug}/dashboard`
            }}>Go to dashboard</button>
          </div>
        )}
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}

type NavItem = { id: string; label: string }
type NavEntry = NavItem | { label: string; items: NavItem[] }

const NAV: NavEntry[] = [
  { id: "dashboard", label: "Dashboard" },
  { label: "Sell", items: [
    { id: "quotes",           label: "Quotes" },
    { id: "sales-orders",     label: "Sales Orders" },
    { id: "delivery-notes",   label: "Despatch" },
    { id: "invoices",         label: "Invoices" },
    { id: "customers",        label: "Customers" },
    { id: "aged-debtors",     label: "Aged Debtors" },
    { id: "overdue-invoices", label: "Overdue Invoices" },
  ] },
  { label: "Buy", items: [
    { id: "purchase-orders", label: "Purchase Orders" },
    { id: "grn",             label: "Goods-In (GRN)" },
    { id: "suppliers",       label: "Suppliers" },
  ] },
  { label: "Stock", items: [
    { id: "stock",             label: "Stock Items" },
    { id: "batches",           label: "Batches" },
    { id: "remnants",          label: "Remnants" },
    { id: "mtcs",              label: "Certificates" },
    { id: "grade-reference",   label: "Grade Reference" },
    { id: "works-orders",      label: "Works Orders" },
    { id: "scheduling",        label: "Scheduling" },
    { id: "subcontracts",      label: "Subcontracts" },
    { id: "ncr",               label: "NCR / RMA" },
    { id: "stock-adjustments", label: "Adjustments" },
    { id: "scrap",             label: "Scrap" },
  ] },
  { label: "Reports", items: [
    { id: "outstanding-lines",     label: "Outstanding Lines" },
    { id: "sales-perf",            label: "Sales Performance" },
    { id: "salesperson-perf",      label: "By Salesperson" },
    { id: "monthly-revenue",       label: "Monthly Revenue" },
    { id: "otif",                  label: "OTIF" },
    { id: "ap-register",           label: "AP Register" },
    { id: "supplier-spend",        label: "Supplier Spend" },
    { id: "outstanding-po-lines",  label: "Outstanding POs" },
    { id: "suppliers/performance", label: "Supplier Performance" },
    { id: "stock-turn",            label: "Stock Turn" },
    { id: "margins",               label: "Margins" },
    { id: "stock-valuation",       label: "Valuation" },
    { id: "low-stock",             label: "Low Stock" },
    { id: "stock-age",             label: "Stock Age" },
    { id: "stock-mix",             label: "Stock Mix" },
  ] },
  { label: "Admin", items: [
    { id: "admin",        label: "Settings & Users" },
    { id: "accounting",   label: "Accounting" },
    { id: "fleet",        label: "Fleet" },
    { id: "loads",        label: "Loads" },
    { id: "fx",           label: "FX" },
    { id: "terms",        label: "T&Cs" },
    { id: "audit",        label: "Audit Log" },
    { id: "branding",     label: "Branding" },
    { id: "edi",          label: "EDI" },
    { id: "grade-register", label: "Grade Register" },
    { id: "import",       label: "Import" },
  ] },
  { id: "pwa", label: "Shop Floor" },
]

function NavGroup({ label, items, company, module }: {
  label: string; items: NavItem[]; company: string; module: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { setOpen(false) }, [module])   // close on navigation
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])
  const active = items.some(i => i.id === module)
  return (
    <div className="nav-group" ref={ref}>
      <span className={`nav-trigger${active ? " active" : ""}`} tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o) } }}>
        {label}
      </span>
      <div className={`nav-menu${open ? " open" : ""}`}>
        {items.map(i => (
          <a key={i.id} href={`#/${company}/${i.id}`} className={module === i.id ? "active" : undefined}
            onClick={() => setOpen(false)}>{i.label}</a>
        ))}
      </div>
    </div>
  )
}

function MobileNav({ nav, company, module }: {
  nav: NavEntry[]; company: string; module: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  useEffect(() => { setOpen(false) }, [module])

  const toggle = (label: string) => setExpanded(e => e === label ? null : label)

  return (
    <>
      <button className="hamburger" aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span /><span /><span />
      </button>
      {open && createPortal(<>
        <div className="drawer-overlay" onClick={() => setOpen(false)} />
        <nav className="drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="drawer-head">
            <div className="brand-icon">M</div>
            <span className="brand-name">Metlstk</span>
            <button className="modal-close" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="drawer-body">
            {nav.map(entry =>
              "items" in entry ? (
                <div key={entry.label} className="drawer-group">
                  <button
                    className={`drawer-group-btn${entry.items.some(i => i.id === module) ? " active" : ""}`}
                    onClick={() => toggle(entry.label)}
                    aria-expanded={expanded === entry.label}
                  >
                    {entry.label}
                    <span className={`drawer-chevron${expanded === entry.label ? " open" : ""}`}>›</span>
                  </button>
                  {expanded === entry.label && (
                    <div className="drawer-items">
                      {entry.items.map(i => (
                        <a key={i.id} href={`#/${company}/${i.id}`}
                          className={`drawer-item${module === i.id ? " active" : ""}`}
                          onClick={() => setOpen(false)}>
                          {i.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <a key={entry.id} href={`#/${company}/${entry.id}`}
                  className={`drawer-flat${module === entry.id ? " active" : ""}`}
                  onClick={() => setOpen(false)}>
                  {entry.label}
                </a>
              )
            )}
          </div>
        </nav>
      </>, document.body)}
    </>
  )
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash || "#/")
  useEffect(() => {
    const h = () => setHash(window.location.hash || "#/")
    window.addEventListener("hashchange", h)
    return () => window.removeEventListener("hashchange", h)
  }, [])
  return hash
}

function parseHash(hash: string) {
  const s = hash.replace(/^#\/?/, "")
  const i1 = s.indexOf("/")
  if (i1 < 0) return { company: s || undefined, module: undefined, id: undefined }
  const company = s.slice(0, i1)
  const rest = s.slice(i1 + 1)
  const i2 = rest.indexOf("/")
  if (i2 < 0) return { company, module: rest || undefined, id: undefined }
  return { company, module: rest.slice(0, i2), id: decodeURIComponent(rest.slice(i2 + 1)) || undefined }
}

function useTableCardLabels() {
  useEffect(() => {
    const stamp = () => {
      document.querySelectorAll('table').forEach(tbl => {
        const ths = Array.from(tbl.querySelectorAll('thead th')).map(th => th.textContent?.trim() ?? '')
        if (!ths.length) return
        tbl.querySelectorAll('tbody tr').forEach(tr => {
          Array.from(tr.querySelectorAll('td')).forEach((td, i) => {
            if (ths[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', ths[i])
          })
        })
      })
    }
    stamp()
    const mo = new MutationObserver(stamp)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [])
}

export default function App() {
  useTableCardLabels()
  const hash = useHash()
  const session = useSession()
  const { company, module, id } = parseHash(hash)
  const [companies, setCompanies] = useState<CoEntry[]>([])
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    if (!session) return
    api.adminCompanies().then(setCompanies).catch(() => {})
  }, [session])

  // Portal is a separate app with its own (Supabase) auth — render before the internal guard.
  if (hash.startsWith("#/portal")) return <PortalApp />

  if (session === undefined) return <p className="state-msg">Loading…</p>
  if (session === null) return <LoginPage />
  const validCompany = company ? companies.some(c => c.slug === company) : false
  if (module === "pwa" && validCompany)
    return <PwaShell company={company!} />

  const email = session.user?.email ?? ""
  const initials = email.slice(0, 2).toUpperCase()

  if (!company || !validCompany) {
    return (
      <>
        <div className="picker">
          <div className="picker-inner">
            <div className="picker-logo">
              <div className="brand-icon">M</div>
              <span className="picker-brand">Metlstk</span>
            </div>
            <p>Select a company to continue</p>
            <div className="co-grid">
              {companies.map(c => (
                <a key={c.slug} href={`#/${c.slug}/dashboard`} className="co-card">
                  <strong>{c.name}</strong>
                  <span>{c.slug}</span>
                </a>
              ))}
            </div>
            <button type="button" className="btn btn-secondary" style={{ marginTop: "1rem" }}
              onClick={() => setShowWizard(true)}>+ New company</button>
          </div>
        </div>
        {showWizard && (
          <NewCompanyWizard
            onClose={() => setShowWizard(false)}
            onDone={co => { setCompanies(cs => [...cs, co]); setShowWizard(false) }}
          />
        )}
      </>
    )
  }

  const coName = companies.find(c => c.slug === company)?.name ?? company

  return (
    <div className="layout">
      <header>
        <a href="#/" className="brand-wrap">
          <div className="brand-icon">M</div>
          <span className="brand-name">Metlstk</span>
        </a>
        <span className="co-label">{coName}</span>
        <nav>
          {NAV.map(entry => (
            "items" in entry
              ? <NavGroup key={entry.label} label={entry.label} items={entry.items} company={company} module={module} />
              : <a key={entry.id} href={`#/${company}/${entry.id}`} className={module === entry.id ? "active" : undefined}>{entry.label}</a>
          ))}
        </nav>
        <MobileNav nav={NAV} company={company} module={module} />
        <KpiAlertBell company={company} />
        <a className="user-avatar" href={`#/${company}/profile`} title={`${email} — my profile`}>{initials}</a>
        <button className="signout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <main>
        {(module === "dashboard" || !module) && !id && <Dashboard  company={company} />}
        {module === "profile"         && <UserProfile      company={company} />}
        {module === "admin"           && !id && <AdminUsers        company={company} />}
        {module === "audit"           && !id && <AuditLog          company={company} />}
        {module === "customers"       && !id && <CustomerList      company={company} />}
        {module === "customers"       && id === "new" && <CustomerNew    company={company} />}
        {module === "customers"       &&  id && id !== "new" && <CustomerDetail    company={company} id={id} />}
        {module === "purchase-orders" && !id && <PurchaseOrderList company={company} />}
        {module === "purchase-orders" && id?.startsWith("new") && <PONew company={company}
          initialStock={id.includes("?stock=") ? decodeURIComponent(id.split("?stock=")[1]?.split("&")[0] ?? "") : undefined}
          initialQty={id.includes("?qty=") ? parseFloat(decodeURIComponent(id.split("?qty=")[1]?.split("&")[0] ?? "")) || undefined : undefined}
        />}
        {module === "purchase-orders" &&  id && id !== "new" && <PurchaseOrderDetail company={company} id={id} />}
        {module === "quotes"          && !id && <QuoteList         company={company} />}
        {module === "quotes"          &&  id === "new" && <QuoteNew company={company} />}
        {module === "quotes"          &&  id && id !== "new" && <QuoteDetail company={company} id={id} />}
        {module === "sales-orders"    && !id && <SalesOrderList    company={company} />}
        {module === "sales-orders"    &&  id === "new" && <SalesOrderNew company={company} />}
        {module === "sales-orders"    &&  id && id !== "new" && !id.endsWith("/dispatch") && <SalesOrderDetail  company={company} id={id} />}
        {module === "sales-orders"    &&  id &&  id.endsWith("/dispatch") && <DispatchView company={company} id={id.replace("/dispatch", "")} />}
        {module === "delivery-notes"  && !id && <DeliveryNoteList   company={company} />}
        {module === "delivery-notes"  &&  id && <DeliveryNoteDetail company={company} id={id} />}
        {module === "invoices"        && !id && <InvoiceList       company={company} />}
        {module === "invoices"        &&  id && <InvoiceDetail     company={company} id={id} />}
        {module === "accounting"      && <AccountingView           company={company} />}
        {module === "aged-debtors"    && <AgedDebtors              company={company} />}
        {module === "overdue-invoices" && <OverdueInvoicesReport  company={company} />}
        {module === "sales-perf"      && <SalesPerfReport        company={company} />}
        {module === "salesperson-perf" && <SalespersonPerfReport company={company} />}
        {module === "monthly-revenue"  && <MonthlyRevenueReport  company={company} />}
        {module === "outstanding-lines" && <OutstandingLinesReport company={company} />}
        {module === "outstanding-po-lines" && <OutstandingPOLinesReport company={company} />}
        {module === "otif"            && <OTIFReport            company={company} />}
        {module === "stock-turn"      && <StockTurnReport       company={company} />}
        {module === "margins"         && <MarginsReport         company={company} />}
        {module === "stock-valuation" && <StockValuationReport  company={company} />}
        {module === "low-stock"       && <LowStockReport        company={company} />}
        {module === "stock-age"       && <StockAgeReport        company={company} />}
        {module === "stock-mix"       && <StockMixReport        company={company} />}
        {module === "ap-register"     && <APRegister            company={company} />}
        {module === "supplier-spend"  && <SupplierSpendReport  company={company} />}
        {module === "stock"           && !id && <StockList         company={company} />}
        {module === "stock"           && id === "new" && <StockNew  company={company} />}
        {module === "stock"           &&  id && id !== "new" && <StockDetail company={company} id={id} />}
        {module === "grn"             && !id && <GRNList           company={company} />}
        {module === "grn"             &&  id?.startsWith("new") && <GRNNew  company={company} initialPO={id.includes("?po=") ? decodeURIComponent(id.split("?po=")[1] ?? "") : undefined} />}
        {module === "grn"             &&  id && !id.startsWith("new") && <GRNDetail company={company} id={id} />}
        {module === "scheduling"       && <ProductionSchedule  company={company} />}
        {module === "works-orders"    && !id && <WorkOrderList     company={company} />}
        {module === "works-orders"    &&  id?.startsWith("new") && <WorkOrderNew company={company}
          initialBatch={id.includes("?batch=") ? decodeURIComponent(id.split("?batch=")[1]?.split("&")[0] ?? "") : undefined} />}
        {module === "works-orders"    &&  id && !id.startsWith("new") && <WorkOrderDetail company={company} id={id} />}
        {module === "mtcs"            && !id && <MTCList           company={company} />}
        {module === "mtcs"            &&  id && <MTCDetail         company={company} id={id} />}
        {module === "batches"         && !id && <StockBatchList    company={company} />}
        {module === "batches"         &&  id && <StockBatchDetail  company={company} id={id} />}
        {module === "remnants"        && <RemnantRegister        company={company} />}
        {module === "fleet"           && !id && <Fleet             company={company} />}
        {module === "loads"           && !id && <LoadList          company={company} />}
        {module === "suppliers"       && !id && <SupplierList         company={company} />}
        {module === "suppliers"       && id === "new" && <SupplierNew company={company} />}
        {module === "suppliers"       && id === "performance" && <SupplierPerformanceReport company={company} />}
        {module === "suppliers"       && id && id !== "new" && id !== "performance" && <SupplierDetailView company={company} id={id} />}
        {module === "statement"        && id && <CustomerStatement company={company} id={id} />}
        {module === "terms"            && <TermsView    company={company} />}
        {module === "fx"               && <FxView      company={company} />}
        {module === "branding"         && <BrandingView company={company} />}
        {module === "stock-adjustments" && <StockAdjustmentsView company={company} />}
        {module === "scrap"             && <ScrapDashboard       company={company} />}
        {module === "subcontracts"      && <SubcontractsView     company={company} />}
        {module === "ncr"               && !id && <NCRList company={company} onSelect={ncrId => { window.location.hash = `#/${company}/ncr/${ncrId}` }} />}
        {module === "ncr"               &&  id && <NCRDetail company={company} id={id} />}
        {module === "edi"               && <EdiView              company={company} />}
        {module === "grade-register"    && <GradeRegisterView    company={company} />}
        {module === "grade-reference" && !id && <GradeReferenceList   company={company} />}
        {module === "grade-reference" &&  id && <GradeReferenceDetail company={company} id={id} />}
        {module === "import"            && <ImportView           company={company} />}
      </main>
      <AssistPanel company={company} screen={`${module ?? "dashboard"}${id ? "/" + id : ""}`} />
    </div>
  )
}
