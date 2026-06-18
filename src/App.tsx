import { useState, useEffect } from "react"
import {
  CustomerList, CustomerDetail,
  PurchaseOrderList, PurchaseOrderDetail,
  SalesOrderList, SalesOrderDetail,
  InvoiceList, InvoiceDetail,
  StockList, StockDetail,
  DispatchView,
  GRNList, GRNNew, GRNDetail,
  StockBatchList,
} from "./views"
import { useSession, LoginPage } from "./auth"
import { supabase } from "./supabase"

const COMPANIES: Record<string, string> = {
  ferrovale: "Ferrovale Steel",
  brackmoor: "Brackmoor Metals",
}

const MODULES = [
  { id: "customers",       label: "Customers" },
  { id: "purchase-orders", label: "Purchase Orders" },
  { id: "sales-orders",    label: "Sales Orders" },
  { id: "invoices",        label: "Invoices" },
  { id: "stock",           label: "Stock" },
  { id: "grn",             label: "GRNs" },
  { id: "batches",         label: "Stock Batches" },
]

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

export default function App() {
  const session = useSession()
  const { company, module, id } = parseHash(useHash())

  if (session === undefined) return <p className="state-msg">Loading…</p>
  if (session === null) return <LoginPage />

  if (!company || !(company in COMPANIES)) {
    return (
      <div className="picker">
        <div className="picker-inner">
          <h1>Metlstk</h1>
          <p>Select a company to continue</p>
          <div className="co-grid">
            {Object.entries(COMPANIES).map(([id, name]) => (
              <a key={id} href={`#/${id}/customers`} className="co-card">
                <strong>{name}</strong>
                <span>{id}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const moduleLabel = MODULES.find(m => m.id === module)?.label ?? module ?? "—"
  const isDispatch = id?.endsWith("/dispatch")
  const displayId  = isDispatch ? id!.replace("/dispatch", "") : id
  const title = isDispatch
    ? `Dispatch: ${displayId}`
    : id ? `${moduleLabel}: ${id}` : moduleLabel

  return (
    <div className="layout">
      <header>
        <a href="#/" className="brand">Metlstk</a>
        <span className="co-label">{COMPANIES[company]}</span>
        <nav>
          {MODULES.map(m => (
            <a
              key={m.id}
              href={`#/${company}/${m.id}`}
              className={module === m.id ? "active" : undefined}
            >
              {m.label}
            </a>
          ))}
        </nav>
        <a href="#/" className="switch-link">Switch company</a>
        <button className="signout-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <main>
        <h2>{title}</h2>
        {module === "customers"       && !id && <CustomerList      company={company} />}
        {module === "customers"       &&  id && <CustomerDetail    company={company} id={id} />}
        {module === "purchase-orders" && !id && <PurchaseOrderList company={company} />}
        {module === "purchase-orders" &&  id && <PurchaseOrderDetail company={company} id={id} />}
        {module === "sales-orders"    && !id && <SalesOrderList    company={company} />}
        {module === "sales-orders"    &&  id && !id.endsWith("/dispatch") && <SalesOrderDetail  company={company} id={id} />}
        {module === "sales-orders"    &&  id &&  id.endsWith("/dispatch") && <DispatchView company={company} id={id.replace("/dispatch", "")} />}
        {module === "invoices"        && !id && <InvoiceList       company={company} />}
        {module === "invoices"        &&  id && <InvoiceDetail     company={company} id={id} />}
        {module === "stock"           && !id && <StockList         company={company} />}
        {module === "stock"           &&  id && <StockDetail       company={company} id={id} />}
        {module === "grn"             && !id && <GRNList           company={company} />}
        {module === "grn"             &&  id === "new" && <GRNNew  company={company} />}
        {module === "grn"             &&  id && id !== "new" && <GRNDetail company={company} id={id} />}
        {module === "batches"         && !id && <StockBatchList    company={company} />}
        {!module && <p className="state-msg">Choose a module from the navigation above.</p>}
      </main>
    </div>
  )
}
