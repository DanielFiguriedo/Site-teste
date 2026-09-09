import { useCallback, useEffect, useState } from "react";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@shared/types";
import { formatBRL } from "@shared/money";
import { api } from "../lib/api";
import { useCopyToClipboard } from "../lib/clipboard";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { ChipButton } from "../components/Chip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { CheckIcon, CopyIcon } from "../components/Icons";
import { cn } from "../lib/cn";

interface AdminOrder {
  publicId: string;
  nick: string;
  platform: string;
  recipientNick: string | null;
  email: string | null;
  status: OrderStatus;
  totalCents: number;
  adminNote: string | null;
  deliveredBy: string | null;
  createdAt: string | null;
  paidAt: string | null;
  deliveredAt: string | null;
  items: { name: string; quantity: number; priceCents: number }[];
}

interface Summary {
  byStatus: Partial<Record<OrderStatus, number>>;
  revenueCents: number;
}

const TABS: { key: string; label: string }[] = [
  { key: "paid", label: "A entregar" },
  { key: "needs_review", label: "Em revisão" },
  { key: "delivered", label: "Entregues" },
  { key: "awaiting_payment", label: "Aguardando Pix" },
  { key: "all", label: "Todos" },
];

export function AdminOrders() {
  const [tab, setTab] = useState("paid");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [summary, setSummary] = useState<Summary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (status: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const [list, nextSummary] = await Promise.all([
        api<{ orders: AdminOrder[] }>(`/admin/orders?status=${status}`),
        api<Summary>("/admin/orders/summary"),
      ]);
      setOrders(list.orders);
      setSummary(nextSummary);
    } catch (e) {
      // Without this catch, any network failure would leave the panel stuck on
      // the skeleton forever, saying nothing about what went wrong.
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  const toDeliver = summary?.byStatus.paid ?? 0;
  const underReview = summary?.byStatus.needs_review ?? 0;

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Pedidos</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {toDeliver > 0
          ? `${toDeliver} ${toDeliver === 1 ? "pedido pago aguarda" : "pedidos pagos aguardam"} entrega.`
          : "Nenhum pedido esperando entrega. Tudo em dia."}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="A entregar" value={String(toDeliver)} alert={toDeliver > 0} />
        <StatCard label="Em revisão" value={String(underReview)} alert={underReview > 0} />
        <StatCard label="Receita confirmada" value={formatBRL(summary?.revenueCents ?? 0)} />
      </div>

      <nav className="mt-7 flex flex-wrap gap-2" aria-label="Filtrar pedidos por status">
        {TABS.map((item) => (
          <ChipButton key={item.key} active={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </ChipButton>
        ))}
      </nav>

      <div className="mt-5 space-y-3">
        {loading &&
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-card bg-surface-1" />
          ))}

        {error && (
          <p
            role="alert"
            className="rounded-card border border-danger/25 bg-danger/10 p-4 text-sm text-danger"
          >
            Não foi possível carregar os pedidos: {error}
          </p>
        )}

        {!loading && !error && orders.length === 0 && (
          <p className="rounded-card border border-line bg-surface-1 p-8 text-center text-sm text-ink-muted">
            Nenhum pedido nesta lista.
          </p>
        )}

        {!loading &&
          orders.map((order) => (
            <OrderRow key={order.publicId} order={order} onChange={() => void load(tab)} />
          ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border p-4",
        alert ? "border-warn/30 bg-warn/8" : "border-line bg-surface-1",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={cn(
          "tabular mt-1 font-display text-2xl font-extrabold",
          alert ? "text-warn" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function OrderRow({ order, onChange }: { order: AdminOrder; onChange: () => void }) {
  const { copied, copy } = useCopyToClipboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Irreversible actions (cancel, refund) require a second click.
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);

  // The recipient is who receives, when there is one — this is the nick the
  // owner types into the server command, and swapping the two delivers the item
  // to the wrong person.
  const recipient = order.recipientNick ?? order.nick;
  const label = ORDER_STATUS_LABELS[order.status];

  const change = async (status: OrderStatus) => {
    setBusy(true);
    setError(undefined);
    setConfirming(null);
    try {
      await api(`/admin/orders/${order.publicId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** One click arms it, the second executes. */
  const dangerous = (status: OrderStatus, buttonLabel: string) =>
    confirming === status ? (
      <Button size="sm" variant="danger" disabled={busy} onClick={() => change(status)}>
        Confirmar
      </Button>
    ) : (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(status)}>
        {buttonLabel}
      </Button>
    );

  return (
    <article className="rounded-card border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <PlayerAvatar nick={recipient} size={44} className="rounded-control border border-line" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => copy(recipient)}
              aria-label={`Copiar o nick ${recipient}`}
              className="inline-flex items-center gap-1.5 font-display text-base font-bold hover:text-ink"
            >
              {recipient}
              <span className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true">
                {copied ? <CheckIcon /> : <CopyIcon />}
              </span>
            </button>

            <Badge tone={label.tone}>{label.text}</Badge>
            <Badge tone="neutral">{order.platform}</Badge>
            {order.recipientNick && <Badge tone="warn">presente de {order.nick}</Badge>}
          </div>

          <ul className="mt-2 space-y-0.5 text-sm text-ink-muted">
            {order.items.map((item, index) => (
              <li key={index}>
                {item.quantity} × {item.name}
              </li>
            ))}
          </ul>

          <p className="tabular mt-2 text-xs text-ink-muted">
            {order.email} · {order.publicId.slice(0, 8).toUpperCase()} ·{" "}
            {formatDate(order.paidAt ?? order.createdAt)}
            {order.deliveredBy && ` · entregue por ${order.deliveredBy}`}
          </p>

          {order.adminNote && (
            <p className="mt-2 rounded-control border border-warn/25 bg-warn/10 p-2 text-xs text-warn">
              {order.adminNote}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end">
          <span className="tabular font-display text-lg font-bold text-accent">
            {formatBRL(order.totalCents)}
          </span>

          {order.status === "paid" && (
            <div className="flex gap-2">
              {dangerous("cancelled", "Cancelar")}
              <Button size="sm" disabled={busy} onClick={() => change("delivered")}>
                <span className="h-3.5 w-3.5" aria-hidden="true">
                  <CheckIcon />
                </span>
                Entreguei
              </Button>
            </div>
          )}

          {order.status === "needs_review" && (
            <div className="flex gap-2">
              {dangerous("cancelled", "Cancelar")}
              <Button size="sm" disabled={busy} onClick={() => change("paid")}>
                Liberar
              </Button>
            </div>
          )}

          {order.status === "delivered" && dangerous("refunded", "Reembolsar")}
        </div>
      </div>
    </article>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
