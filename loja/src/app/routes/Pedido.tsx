import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ROTULO_STATUS, type Pedido, type StatusPedido } from "@shared/types";
import { formatarBRL } from "@shared/dinheiro";
import { api } from "../lib/api";
import { useCopiar } from "../lib/copiar";
import { useLoja } from "../lib/loja-context";
import { Botao } from "../components/Botao";
import { Selo } from "../components/Selo";
import { IconeCheque, IconeCopiar, IconeInfo } from "../components/Icones";
import { AvatarNick } from "../components/AvatarNick";
import { cn } from "../lib/cn";

/** Intervalo de consulta enquanto o pagamento não cai. */
const INTERVALO_MS = 4000;

/**
 * Cores do QR Code.
 *
 * Não saem dos tokens do tema de propósito: o leitor do banco precisa de alto
 * contraste real (quase preto sobre branco puro), e as superfícies escuras da
 * loja não seriam legíveis pela câmera.
 */
const QR_ESCURO = "#0b0f14";
const QR_CLARO = "#ffffff";

export function PedidoPagina() {
  const { publicId } = useParams();
  const { config } = useLoja();
  const [pedido, setPedido] = useState<Pedido>();
  const [erro, setErro] = useState<string>();

  const buscar = useCallback(async (id: string, ehPolling: boolean) => {
    try {
      setPedido(await api<Pedido>(`/pedidos/${id}`));
      setErro(undefined);
    } catch (e) {
      // Uma falha momentânea durante o polling não pode apagar o QR Code da
      // tela: o pedido continua válido e o comprador pode estar pagando agora.
      if (!ehPolling) setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!publicId) return;
    void buscar(publicId, false);
  }, [publicId, buscar]);

  // Enquanto o pagamento não cai, consulta em laço. Para assim que o status
  // muda — deixar o laço rodando à toa queima cota de leitura do D1.
  useEffect(() => {
    if (!publicId || pedido?.status !== "aguardando_pagamento") return;
    const timer = setInterval(() => void buscar(publicId, true), INTERVALO_MS);
    return () => clearInterval(timer);
  }, [publicId, pedido?.status, buscar]);

  if (!publicId) return <FormularioBusca />;

  if (erro) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Pedido não encontrado</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Confira o link. Ele aparece logo depois que o Pix é gerado.
        </p>
        <Link to="/loja" className="mt-6 inline-block text-sm font-semibold text-accent">
          Voltar para a loja
        </Link>
      </div>
    );
  }

  if (!pedido) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-10">
        <div className="h-10 w-48 animate-pulse rounded-control bg-surface-1" />
        <div className="mt-6 h-80 animate-pulse rounded-card bg-surface-1" />
        <div className="mt-5 h-40 animate-pulse rounded-card bg-surface-1" />
      </div>
    );
  }

  const rotulo = ROTULO_STATUS[pedido.status];

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">Seu pedido</h1>
        <Selo tom={rotulo.tom}>{rotulo.texto}</Selo>
      </div>
      <p className="tabular mt-1.5 text-sm text-ink-muted">
        Código {pedido.publicId.slice(0, 8).toUpperCase()}
      </p>

      {/* A tela troca de painel sozinha quando o Pix é confirmado. Sem esta
          região viva, quem usa leitor de tela não fica sabendo. */}
      <div role="status" aria-live="polite">
        {pedido.status === "aguardando_pagamento" && <PainelPix pedido={pedido} />}
        {(pedido.status === "pago" || pedido.status === "entregue") && (
          <PainelConfirmado pedido={pedido} prazo={config?.prazoEntrega} />
        )}
        {(pedido.status === "expirado" ||
          pedido.status === "cancelado" ||
          pedido.status === "reembolsado" ||
          pedido.status === "em_revisao") && <PainelEncerrado status={pedido.status} />}
      </div>

      <Resumo pedido={pedido} />
    </div>
  );
}

function PainelPix({ pedido }: { pedido: Pedido }) {
  const { copiado, copiar } = useCopiar();
  const [qr, setQr] = useState<string | null>(null);
  const [restante, setRestante] = useState<number>(0);

  // Prefere o PNG do gateway; se ele não vier, o QR é gerado a partir do
  // próprio copia e cola, para a tela nunca ficar sem código escaneável.
  useEffect(() => {
    if (pedido.pixQrBase64) {
      setQr(`data:image/png;base64,${pedido.pixQrBase64}`);
      return;
    }
    if (!pedido.pixCopiaCola) return;

    // Carregado sob demanda: a biblioteca de QR pesa mais que o resto da
    // vitrine junta, e só esta tela precisa dela.
    const codigo = pedido.pixCopiaCola;
    let cancelado = false;

    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(codigo, {
          width: 512,
          margin: 1,
          color: { dark: QR_ESCURO, light: QR_CLARO },
        }),
      )
      .then((url) => {
        if (!cancelado) setQr(url);
      })
      .catch(() => {
        if (!cancelado) setQr(null);
      });

    return () => {
      cancelado = true;
    };
  }, [pedido.pixQrBase64, pedido.pixCopiaCola]);

  useEffect(() => {
    if (!pedido.expiraEm) return;
    const alvo = new Date(pedido.expiraEm).getTime();
    const tick = () => setRestante(Math.max(0, Math.floor((alvo - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [pedido.expiraEm]);

  const minutos = String(Math.floor(restante / 60)).padStart(2, "0");
  const segundos = String(restante % 60).padStart(2, "0");

  return (
    <div className="mt-6 rounded-card border border-line bg-surface-1 p-6 shadow-card">
      <div className="flex flex-col items-center text-center">
        <div className="rounded-card p-3" style={{ backgroundColor: QR_CLARO }}>
          {qr ? (
            <img src={qr} alt="QR Code do Pix" className="h-48 w-48" />
          ) : (
            <div className="grid h-48 w-48 place-items-center text-xs text-surface-0">
              Gerando QR...
            </div>
          )}
        </div>

        <p className="tabular mt-5 font-display text-3xl font-extrabold text-accent">
          {formatarBRL(pedido.totalCentavos)}
        </p>

        {pedido.expiraEm && (
          // O cronômetro muda a cada segundo; anunciá-lo faria o leitor de tela
          // falar sem parar por cima do resto da página.
          <p className="mt-1 text-sm text-ink-muted" aria-live="off">
            {restante > 0 ? (
              <>
                Expira em{" "}
                <span className="tabular font-semibold text-ink">
                  {minutos}:{segundos}
                </span>
              </>
            ) : (
              "Este código expirou. Faça um novo pedido."
            )}
          </p>
        )}
      </div>

      {pedido.pixCopiaCola && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Pix copia e cola
          </p>
          <div className="flex gap-2">
            <p className="min-w-0 flex-1 truncate rounded-control border border-line bg-surface-inset px-3 py-3 font-mono text-xs text-ink-muted">
              {pedido.pixCopiaCola}
            </p>
            <Botao
              onClick={() => copiar(pedido.pixCopiaCola!)}
              className="shrink-0"
              variante={copiado ? "secundario" : "primario"}
              aria-label="Copiar o código Pix"
            >
              <span className="h-4 w-4">{copiado ? <IconeCheque /> : <IconeCopiar />}</span>
              {copiado ? "Copiado" : "Copiar"}
            </Botao>
          </div>
        </div>
      )}

      <p className="mt-5 text-center text-xs text-ink-muted">
        Assim que o banco confirmar, esta página muda sozinha. Pode deixá-la aberta.
      </p>

      {import.meta.env.DEV && <BotaoSimular publicId={pedido.publicId} />}
    </div>
  );
}

/** Atalho de desenvolvimento: o sandbox do Mercado Pago não paga Pix de verdade. */
function BotaoSimular({ publicId }: { publicId: string }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="mt-5 border-t border-dashed border-line pt-4">
      <Botao
        variante="secundario"
        tamanho="sm"
        className="w-full"
        disabled={enviando}
        onClick={async () => {
          setEnviando(true);
          await api("/dev/simular-pagamento", {
            method: "POST",
            body: JSON.stringify({ publicId }),
          }).catch(() => undefined);
          setEnviando(false);
        }}
      >
        {enviando ? "Simulando..." : "Simular pagamento (desenvolvimento)"}
      </Botao>
    </div>
  );
}

function PainelConfirmado({ pedido, prazo }: { pedido: Pedido; prazo: string | undefined }) {
  const entregue = pedido.status === "entregue";
  const destinatario = pedido.nickPresenteado ?? pedido.nick;

  return (
    <div className="mt-6 rounded-card border border-accent/25 bg-accent/8 p-6 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/15 p-3.5 text-accent">
        <IconeCheque />
      </span>

      <h2 className="mt-4 font-display text-xl font-bold">
        {entregue ? "Itens entregues!" : "Pagamento confirmado!"}
      </h2>

      <div className="mt-3 flex items-center justify-center gap-2">
        <AvatarNick nick={destinatario} tamanho={32} className="rounded-md border border-line" />
        <span className="font-display text-sm font-bold">{destinatario}</span>
      </div>

      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">
        {entregue
          ? "Entre no servidor para conferir. Qualquer problema, fale com a equipe."
          : `Seu pedido entrou na fila de entrega. A equipe entrega ${prazo ?? "em breve"}.`}
      </p>

      {!entregue && (
        <p className="mt-4 text-xs text-ink-muted">
          Guarde este link para acompanhar quando a entrega for feita.
        </p>
      )}
    </div>
  );
}

function PainelEncerrado({ status }: { status: StatusPedido }) {
  const textos: Partial<Record<StatusPedido, string>> = {
    expirado: "O prazo para pagar este Pix acabou. Faça um novo pedido — leva menos de um minuto.",
    cancelado: "Este pedido foi cancelado. Se você pagou mesmo assim, fale com a equipe.",
    reembolsado: "O valor deste pedido foi devolvido.",
    em_revisao:
      "Recebemos um pagamento que não bateu com este pedido. Nossa equipe está conferindo e " +
      "entra em contato pelo e-mail informado. Não pague de novo.",
  };

  return (
    <div className="mt-6 rounded-card border border-line bg-surface-1 p-6 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2 p-3 text-ink-muted">
        <IconeInfo />
      </span>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
        {textos[status]}
      </p>
      <Link to="/loja" className="mt-5 inline-block text-sm font-semibold text-accent">
        Voltar para a loja
      </Link>
    </div>
  );
}

function Resumo({ pedido }: { pedido: Pedido }) {
  return (
    <section className="mt-5 rounded-card border border-line bg-surface-1 p-5">
      <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide text-ink-muted">
        Itens
      </h2>

      <ul className="space-y-3">
        {pedido.itens.map((item) => (
          <li key={item.produtoId} className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              <span className="font-semibold">{item.nome}</span>
              {item.quantidade > 1 && <span className="text-ink-muted"> × {item.quantidade}</span>}
            </span>
            <span className="tabular shrink-0 text-ink-muted">
              {formatarBRL(item.precoCentavos * item.quantidade)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Nick</dt>
          <dd className="font-semibold">{pedido.nick}</dd>
        </div>
        {pedido.nickPresenteado && (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Presente para</dt>
            <dd className="font-semibold">{pedido.nickPresenteado}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Plataforma</dt>
          <dd className="font-semibold capitalize">{pedido.plataforma}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Total</dt>
          <dd className="tabular font-semibold text-accent">{formatarBRL(pedido.totalCentavos)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Tela de /pedido sem código: o comprador cola o link ou o código que recebeu. */
function FormularioBusca() {
  const navegar = useNavigate();
  const [busca, setBusca] = useState("");
  const codigo = busca.trim().split("/").pop() ?? "";

  return (
    <form
      className="mx-auto max-w-md px-4 py-20 text-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (codigo) navegar(`/pedido/${codigo}`);
      }}
    >
      <h1 className="font-display text-2xl font-extrabold">Acompanhar pedido</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Cole aqui o link ou o código do pedido que você recebeu ao gerar o Pix.
      </p>

      <label className="mt-6 block">
        <span className="sr-only">Código do pedido</span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Código do pedido"
          autoComplete="off"
          className={cn(
            "h-12 w-full rounded-control border border-line bg-surface-inset px-4",
            "text-center text-sm outline-none transition-colors focus:border-accent",
          )}
        />
      </label>

      <Botao type="submit" tamanho="lg" className="mt-3 w-full" disabled={!codigo}>
        Buscar
      </Botao>
    </form>
  );
}
