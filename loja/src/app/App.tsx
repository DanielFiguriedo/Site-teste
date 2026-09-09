import { BrowserRouter, Route, Routes } from "react-router";
import { StoreProvider } from "./lib/store-context";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./routes/Home";
import { Shop } from "./routes/Shop";
import { ProductPage } from "./routes/Product";
import { Checkout } from "./routes/Checkout";
import { OrderPage } from "./routes/Order";
import { LegalPage } from "./routes/Legal";
import { AdminApp } from "./admin/AdminApp";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* The panel has its own header and navigation — nothing from the store. */}
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={<Storefront />} />
      </Routes>
    </BrowserRouter>
  );
}

function Storefront() {
  return (
    <StoreProvider>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:slug" element={<ProductPage />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order" element={<OrderPage />} />
            <Route path="/order/:publicId" element={<OrderPage />} />
            <Route path="/terms" element={<LegalPage title="Termos de uso" field="termsMd" />} />
            <Route
              path="/refund-policy"
              element={<LegalPage title="Política de reembolso" field="refundPolicyMd" />}
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </StoreProvider>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-32 text-center">
      <p className="font-display text-6xl font-extrabold text-surface-3">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-ink-muted">O endereço acessado não existe nesta loja.</p>
    </div>
  );
}
