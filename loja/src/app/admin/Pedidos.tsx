import { useCallback, useEffect, useState } from "react";
import type { StatusPedido } from "@shared/types";
import { formatarBRL } from "@shared/dinheiro";
import { api } from "../lib/api";
import { useCopiar } from "../lib/copiar";
import { Botao } from "../components/Botao";
import { Selo } from "../components/Selo";
import { AvatarNick } from "../components/AvatarNick";
import { IconeCheque, IconeCopiar } from "../components/Icones";
import { cn } from "../lib/cn";

interface PedidoAdmin {
  publicId: string;
  nick: string;
  plataforma: string;
  nickPresenteado: string | null;
  email: string | null;
  status: StatusPedido;
  totalCentavos: number;
  notaAdmin: string | null;
  entreguePor: string | null;
  criadoEm: string | null;
  pagoEm: string | null;
  entregueEm: string | null;
  itens: { nome: string; quantidade: number; precoCentavos: number }[];
}

interface Resumo {
  porStatus: Partial<Record<StatusPedido, number>>;
  receitaCentavos: number;
}

const ABAS: { chave: string; rotulo: string }[] = [
  { chave: "pago", rotulo: "A entregar" },
  { chave: "entregue", rotulo: "Entregues" },
  { chave: "aguardando_pagamento", rotulo: "Aguardando Pix" },
  { chave: "todos", rotulo: "Todos" },
];

export function PedidosAdmin() {
  const [aba, setAba] = useState("pago");
  const [pedidos, setPedidos] = useState<PedidoAdmin[]>([]);
  const [resumo, setResumo] = useState<Resumo>();
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async (status: string) => {
    setCarregando(true);
    const [lista, novoResumo] = await Promise.all([
      api<{ pedidos: PedidoAdmin[] }>(`/admin/pedidos?status=${status}`),
      api<Resumo>("/admin/pedidos/resumo"),
    ]);
    setPedidos(lista.pedidos);
    setResumo(novoResumo);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar(aba);
  }, [aba, carregar]);

  const aEntregar = resumo?.porStatus.pago ?? 0;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Pedidos</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {aEntregar > 0
          ? `${aEntregar} ${aEntregar === 1 ? "pedido pago aguarda" : "pedidos pagos aguardam"} entrega.`
          : "Nenhum pedido esperando entrega. Tudo em dia."}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="A entregar" valor={String(aEntregar)} destaque={aEntregar > 0} />
        <Cartao rotulo="Entregues" valor={String(resumo?.porStatus.entregue ?? 0)} />
        <Cartao
          rotulo="Receita confirmada"
          valor={formatarBRL(resumo?.receitaCentavos ?? 0)}
        />
      </div>

      <nav className="mt-7 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            onClick={() => setAba(a.chave)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
              aba === a.chave
                ? "border-accent bg-accent/12 text-accent"
                : "border-line bg-surface-1 text-ink-muted hover:text-ink",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </nav>

      <div className="mt-5 space-y-3">
        {carregando && <div className="h-28 animate-pulse rounded-card bg-surface-1" />}
        {!carregando && pedidos.length === 0 && (
          <p className="rounded-card border border-line bg-surface-1 p-8 text-center text-sm text-ink-muted">
            Nenhum pedido nesta lista.
          </p>
        )}
        {pedidos.map((p) => (
          <LinhaPedido key={p.publicId} pedido={p} aoMudar={() => void carregar(aba)} />
        ))}
      </div>
    </div>
  );
}

function Cartao({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border p-4",
        destaque ? "border-accent/30 bg-accent/8" : "border-line bg-surface-1",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{rotulo}</p>
      <p
        className={cn(
          "tabular mt-1 font-display text-2xl font-extrabold",
          destaque ? "text-accent" : "text-ink",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

const TONS: Record<StatusPedido, "accent" | "neutro" | "warn" | "danger"> = {
  aguardando_pagamento: "warn",
  pago: "accent",
  entregue: "neutro",
  expirado: "neutro",
  cancelado: "danger",
  reembolsado: "neutro",
};

function LinhaPedido({ pedido, aoMudar }: { pedido: PedidoAdmin; aoMudar: () => void }) {
  const { copiado, copiar } = useCopiar();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string>();

  // Quem recebe é o presenteado, quando existir — é este nick que o dono digita
  // no comando do servidor, e trocar os dois entrega o item à pessoa errada.
  const destinatario = pedido.nickPresenteado ?? pedido.nick;

  const mudar = async (status: StatusPedido) => {
    setOcupado(true);
    setErro(undefined);
    try {
      await api(`/admin/pedidos/${pedido.publicId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      aoMudar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <article className="rounded-card border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <AvatarNick nick={destinatario} tamanho={44} className="rounded-control border border-line" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => copiar(destinatario)}
              title="Copiar o nick"
              className="inline-flex items-center gap-1.5 font-display text-base font-bold hover:text-accent"
            >
              {destinatario}
              <span className="h-3.5 w-3.5 text-ink-faint">
                {copiado ? <IconeCheque /> : <IconeCopiar />}
              </span>
            </button>

            <Selo tom={TONS[pedido.status]}>{pedido.status.replace(/_/g, " ")}</Selo>
            <Selo tom="neutro">{pedido.plataforma}</Selo>
            {pedido.nickPresenteado && <Selo tom="warn">presente de {pedido.nick}</Selo>}
          </div>

          <ul className="mt-2 space-y-0.5 text-sm text-ink-muted">
            {pedido.itens.map((i, idx) => (
              <li key={idx}>
                {i.quantidade} × {i.nome}
              </li>
            ))}
          </ul>

          <p className="tabular mt-2 text-xs text-ink-faint">
            {pedido.email} · {pedido.publicId.slice(0, 8).toUpperCase()} ·{" "}
            {formatarData(pedido.pagoEm ?? pedido.criadoEm)}
            {pedido.entreguePor && ` · entregue por ${pedido.entreguePor}`}
          </p>

          {pedido.notaAdmin && (
            <p className="mt-2 rounded-control border border-warn/25 bg-warn/10 p-2 text-xs text-warn">
              {pedido.notaAdmin}
            </p>
          )}
          {erro && <p className="mt-2 text-xs text-danger">{erro}</p>}
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="tabular font-display text-lg font-bold text-accent">
            {formatarBRL(pedido.totalCentavos)}
          </span>

          {pedido.status === "pago" && (
            <div className="flex gap-2">
              <Botao tamanho="sm" variante="fantasma" disabled={ocupado} onClick={() => mudar("cancelado")}>
                Cancelar
              </Botao>
              <Botao tamanho="sm" disabled={ocupado} onClick={() => mudar("entregue")}>
                <span className="h-3.5 w-3.5">
                  <IconeCheque />
                </span>
                Entreguei
              </Botao>
            </div>
          )}
          {pedido.status === "entregue" && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              disabled={ocupado}
              onClick={() => mudar("reembolsado")}
            >
              Reembolsar
            </Botao>
          )}
        </div>
      </div>
    </article>
  );
}

function formatarData(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
