import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@shared/types";
import { formatBRL } from "@shared/money";
import { api } from "../lib/api";
import { useCopyToClipboard } from "../lib/clipboard";
import { useStore } from "../lib/store-context";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { CheckIcon, CopyIcon, InfoIcon } from "../components/Icons";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { cn } from "../lib/cn";

/** Poll interval while the payment has not landed. */
const POLL_MS = 4000;

/**
 * QR Code colours.
 *
 * Deliberately not theme tokens: the bank's scanner needs genuine high contrast
 * (near-black on pure white), and the store's dark surfaces would not be
 * readable by the camera.
 */
const QR_DARK = "#0b0f14";
const QR_LIGHT = "#ffffff";

export function OrderPage() {
  const { publicId } = useParams();
  const { settings } = useStore();
  const [order, setOrder] = useState<Order>();
  const [error, setError] = useState<string>();

  const fetchOrder = useCallback(async (id: string, isPolling: boolean) => {
    try {
      setOrder(await api<Order>(`/orders/${id}`));
      setError(undefined);
    } catch (e) {
      // A momentary failure during polling must not wipe the QR Code off the
      // screen: the order is still valid and the buyer may be paying right now.
      if (!isPolling) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!publicId) return;
    void fetchOrder(publicId, false);
  }, [publicId, fetchOrder]);

  // Poll while the payment has not landed. Stops as soon as the status changes
  // — leaving the loop running burns D1 read quota for nothing.
  useEffect(() => {
    if (!publicId || order?.status !== "awaiting_payment") return;
    const timer = setInterval(() => void fetchOrder(publicId, true), POLL_MS);
    return () => clearInterval(timer);
  }, [publicId, order?.status, fetchOrder]);

  if (!publicId) return <SearchForm />;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Pedido não encontrado</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Confira o link. Ele aparece logo depois que o Pix é gerado.
        </p>
        <Link to="/shop" className="mt-6 inline-block text-sm font-semibold text-accent">
          Voltar para a loja
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-10">
        <div className="h-10 w-48 animate-pulse rounded-control bg-surface-1" />
        <div className="mt-6 h-80 animate-pulse rounded-card bg-surface-1" />
        <div className="mt-5 h-40 animate-pulse rounded-card bg-surface-1" />
      </div>
    );
  }

  const label = ORDER_STATUS_LABELS[order.status];

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Seu pedido</h1>
        <Badge tone={label.tone}>{label.text}</Badge>
      </div>
      <p className="tabular mt-1.5 text-sm text-ink-muted">
        Código {order.publicId.slice(0, 8).toUpperCase()}
      </p>

      {/* The screen swaps panels on its own once the Pix is confirmed. Without
          this live region, screen reader users never find out. */}
      <div role="status" aria-live="polite">
        {order.status === "awaiting_payment" && <PixPanel order={order} />}
        {(order.status === "paid" || order.status === "delivered") && (
          <ConfirmedPanel order={order} deliveryTime={settings?.deliveryTime} />
        )}
        {(order.status === "expired" ||
          order.status === "cancelled" ||
          order.status === "refunded" ||
          order.status === "needs_review") && <ClosedPanel status={order.status} />}
      </div>

      <Summary order={order} />
    </div>
  );
}

function PixPanel({ order }: { order: Order }) {
  const { copied, copy } = useCopyToClipboard();
  const [qr, setQr] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number>(0);

  // Prefers the gateway PNG; if none arrives, the QR is generated from the BR
  // Code itself, so the screen is never left without a scannable code.
  useEffect(() => {
    if (order.pixQrBase64) {
      setQr(`data:image/png;base64,${order.pixQrBase64}`);
      return;
    }
    if (!order.pixBrCode) return;

    // Loaded on demand: the QR library weighs more than the rest of the
    // storefront put together, and only this screen needs it.
    const code = order.pixBrCode;
    let cancelled = false;

    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(code, {
          width: 512,
          margin: 1,
          color: { dark: QR_DARK, light: QR_LIGHT },
        }),
      )
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });

    return () => {
      cancelled = true;
    };
  }, [order.pixQrBase64, order.pixBrCode]);

  useEffect(() => {
    if (!order.expiresAt) return;
    const target = new Date(order.expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [order.expiresAt]);

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <div className="mt-6 rounded-card border border-line bg-surface-1 p-6 shadow-card">
      <div className="flex flex-col items-center text-center">
        <div className="rounded-card p-3" style={{ backgroundColor: QR_LIGHT }}>
          {qr ? (
            <img src={qr} alt="QR Code do Pix" className="h-48 w-48" />
          ) : (
            <div className="grid h-48 w-48 place-items-center text-xs text-surface-0">
              Gerando QR...
            </div>
          )}
        </div>

        <p className="tabular mt-5 font-display text-3xl font-extrabold text-accent">
          {formatBRL(order.totalCents)}
        </p>

        {order.expiresAt && (
          // The countdown changes every second; announcing it would make a
          // screen reader talk over the rest of the page nonstop.
          <p className="mt-1 text-sm text-ink-muted" aria-live="off">
            {remaining > 0 ? (
              <>
                Expira em{" "}
                <span className="tabular font-semibold text-ink">
                  {minutes}:{seconds}
                </span>
              </>
            ) : (
              "Este código expirou. Faça um novo pedido."
            )}
          </p>
        )}
      </div>

      {order.pixBrCode && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Pix copia e cola
          </p>
          <div className="flex gap-2">
            <p className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface-inset px-3 py-3 font-mono text-xs text-ink-muted">
              {order.pixBrCode}
            </p>
            <Button
              onClick={() => copy(order.pixBrCode!)}
              className="shrink-0"
              variant={copied ? "secondary" : "primary"}
              aria-label="Copiar o código Pix"
            >
              <span className="h-4 w-4" aria-hidden="true">
                {copied ? <CheckIcon /> : <CopyIcon />}
              </span>
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-5 text-center text-xs text-ink-muted">
        Assim que o banco confirmar, esta página muda sozinha. Pode deixá-la aberta.
      </p>

      {import.meta.env.DEV && <SimulateButton publicId={order.publicId} />}
    </div>
  );
}

/** Development shortcut: Mercado Pago's sandbox cannot really pay a Pix. */
function SimulateButton({ publicId }: { publicId: string }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="mt-5 border-t border-dashed border-line pt-4">
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true);
          await api("/dev/simulate-payment", {
            method: "POST",
            body: JSON.stringify({ publicId }),
          }).catch(() => undefined);
          setSubmitting(false);
        }}
      >
        {submitting ? "Simulando..." : "Simular pagamento (desenvolvimento)"}
      </Button>
    </div>
  );
}

function ConfirmedPanel({ order, deliveryTime }: { order: Order; deliveryTime: string | undefined }) {
  const delivered = order.status === "delivered";
  const recipient = order.recipientNick ?? order.nick;

  return (
    <div className="mt-6 rounded-card border border-accent/25 bg-accent/8 p-6 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/15 p-3.5 text-accent">
        <CheckIcon />
      </span>

      <h2 className="mt-4 font-display text-xl font-bold">
        {delivered ? "Itens entregues!" : "Pagamento confirmado!"}
      </h2>

      <div className="mt-3 flex items-center justify-center gap-2">
        <PlayerAvatar nick={recipient} size={32} className="rounded-md border border-line" />
        <span className="font-display text-sm font-bold">{recipient}</span>
      </div>

      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">
        {delivered
          ? "Entre no servidor para conferir. Qualquer problema, fale com a equipe."
          : `Seu pedido entrou na fila de entrega. A equipe entrega ${deliveryTime ?? "em breve"}.`}
      </p>

      {!delivered && (
        <p className="mt-4 text-xs text-ink-muted">
          Guarde este link para acompanhar quando a entrega for feita.
        </p>
      )}
    </div>
  );
}

function ClosedPanel({ status }: { status: OrderStatus }) {
  const texts: Partial<Record<OrderStatus, string>> = {
    expired: "O prazo para pagar este Pix acabou. Faça um novo pedido — leva menos de um minuto.",
    cancelled: "Este pedido foi cancelado. Se você pagou mesmo assim, fale com a equipe.",
    refunded: "O valor deste pedido foi devolvido.",
    needs_review:
      "Recebemos um pagamento que não bateu com este pedido. Nossa equipe está conferindo e " +
      "entra em contato pelo e-mail informado. Não pague de novo.",
  };

  return (
    <div className="mt-6 rounded-card border border-line bg-surface-1 p-6 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2 p-3 text-ink-muted">
        <InfoIcon />
      </span>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
        {texts[status]}
      </p>
      <Link to="/shop" className="mt-5 inline-block text-sm font-semibold text-accent">
        Voltar para a loja
      </Link>
    </div>
  );
}

function Summary({ order }: { order: Order }) {
  return (
    <section className="mt-5 rounded-card border border-line bg-surface-1 p-5">
      <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide text-ink-muted">
        Itens
      </h2>

      <ul className="space-y-3">
        {order.items.map((item) => (
          <li key={item.productId} className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              <span className="font-semibold">{item.name}</span>
              {item.quantity > 1 && <span className="text-ink-muted"> × {item.quantity}</span>}
            </span>
            <span className="tabular shrink-0 text-ink-muted">
              {formatBRL(item.priceCents * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Nick</dt>
          <dd className="font-semibold">{order.nick}</dd>
        </div>
        {order.recipientNick && (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Presente para</dt>
            <dd className="font-semibold">{order.recipientNick}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Plataforma</dt>
          <dd className="font-semibold capitalize">{order.platform}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Total</dt>
          <dd className="tabular font-semibold text-accent">{formatBRL(order.totalCents)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** /order with no code: the buyer pastes the link or code they received. */
function SearchForm() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const code = search.trim().split("/").pop() ?? "";

  return (
    <form
      className="mx-auto max-w-md px-4 py-20 text-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (code) navigate(`/order/${code}`);
      }}
    >
      <h1 className="font-display text-2xl font-extrabold">Acompanhar pedido</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Cole aqui o link ou o código do pedido que você recebeu ao gerar o Pix.
      </p>

      <label className="mt-6 block">
        <span className="sr-only">Código do pedido</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Código do pedido"
          autoComplete="off"
          className={cn(
            "h-12 w-full rounded-control border border-line bg-surface-inset px-4",
            "text-center text-sm outline-none transition-colors focus:border-accent",
          )}
        />
      </label>

      <Button type="submit" size="lg" className="mt-3 w-full" disabled={!code}>
        Buscar
      </Button>
    </form>
  );
}
