import { BrowserRouter, Route, Routes } from "react-router";
import { ProvedorLoja } from "./lib/loja-context";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Home } from "./routes/Home";
import { Loja } from "./routes/Loja";

export function App() {
  return (
    <BrowserRouter>
      <ProvedorLoja>
        <div className="flex min-h-dvh flex-col">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/loja" element={<Loja />} />
              <Route path="*" element={<NaoEncontrado />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </ProvedorLoja>
    </BrowserRouter>
  );
}

function NaoEncontrado() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-32 text-center">
      <p className="font-display text-6xl font-extrabold text-accent/25">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-ink-muted">O endereço acessado não existe nesta loja.</p>
    </div>
  );
}
