import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Plataforma, Produto } from "@shared/types";
import { formatarBRL } from "@shared/dinheiro";
import { api, useApi } from "../lib/api";
import { nickValido, useJogador } from "../lib/nick";
import { AvatarNick } from "../components/AvatarNick";
import { useLoja } from "../lib/loja-context";
import { Botao } from "../components/Botao";
import { IconeCategoria, IconeInfo } from "../components/Icones";
import { Turnstile } from "../components/Turnstile";
import { cn } from "../lib/cn";

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Checkout() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { config } = useLoja();
  const { jogador, salvar } = useJogador();

  const slug = params.get("produto");
  const quantidade = Math.max(1, Number(params.get("qtd") ?? 1));
  const valorLivreCentavos = Number(params.get("valor") ?? 0);

  const { dados: produto, carregando } = useApi<Produto>(slug ? `/produtos/${slug}` : null);

  const [nick, setNick] = useState(jogador?.nick ?? "");
  const [plataforma, setPlataforma] = useState<Plataforma>(jogador?.plataforma ?? "java");
  const [email, setEmail] = useState("");
  const [presentear, setPresentear] = useState(false);
  const [nickPresenteado, setNickPresenteado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const idErroNick = useId();
  const idErroEmail = useId();
  const idErroPresente = useId();

  // O nick salvo pode chegar depois da primeira renderização (leitura do
  // localStorage no primeiro render, mas o hook revalida em `storage`).
  useEffect(() => {
    if (jogador && !nick) {
      setNick(jogador.nick);
      setPlataforma(jogador.plataforma);
    }
  }, [jogador, nick]);

  if (!slug) {
    return <Aviso titulo="Nenhum produto selecionado" acao="Escolher um produto" />;
  }
  if (carregando) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-12">
        <div className="h-96 animate-pulse rounded-card bg-surface-1" />
      </div>
    );
  }
  if (!produto) {
    return <Aviso titulo="Produto não encontrado" acao="Voltar para a loja" />;
  }

  const precoUnitario = produto.precoLivre ? valorLivreCentavos : produto.precoCentavos;
  const qtd = produto.precoLivre ? 1 : quantidade;
  const total = precoUnitario * qtd;

  const nickOk = nickValido(nick, plataforma);
  const emailOk = REGEX_EMAIL.test(email.trim());
  const presenteOk = !presentear || nickValido(nickPresenteado, plataforma);
  // Quando o Turnstile está configurado, o botão só libera com o token — o
  // servidor recusaria de qualquer forma, e barrar aqui evita perder o form.
  const turnstileOk = !config?.turnstileSiteKey || turnstileToken !== null;
  const podeEnviar = nickOk && emailOk && presenteOk && turnstileOk && total > 0 && !enviando;

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(undefined);

    // Guarda o nick para as próximas compras — digitar de novo é a chance de errar.
    salvar({ nick: nick.trim(), plataforma });

    try {
      const resposta = await api<{ publicId: string }>("/checkout", {
        method: "POST",
        body: JSON.stringify({
          produtoSlug: produto.slug,
          quantidade: qtd,
          ...(produto.precoLivre ? { valorCentavos: valorLivreCentavos } : {}),
          nick: nick.trim(),
          plataforma,
          email: email.trim(),
          ...(presentear ? { nickPresenteado: nickPresenteado.trim() } : {}),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      navegar(`/pedido/${resposta.publicId}`);
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10">
      <h1 className="font-display text-3xl font-extrabold">Finalizar compra</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Confira o nick com atenção: é para ele que a equipe vai entregar.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="space-y-5">
          <Bloco titulo="Quem vai receber">
            <div className="flex items-start gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-surface-inset">
                {nickOk ? (
                  <AvatarNick nick={nick.trim()} tamanho={54} />
                ) : (
                  <span className="text-xs text-ink-faint">?</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="sr-only">Nick do jogador</span>
                  <input
                    value={nick}
                    onChange={(e) => setNick(e.target.value)}
                    placeholder="SeuNick"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(nick) && !nickOk}
                    aria-describedby={nick && !nickOk ? idErroNick : undefined}
                    className={cn(
                      "h-14 w-full rounded-control border bg-surface-inset px-4",
                      "font-display text-lg font-semibold outline-none transition-colors",
                      nick && !nickOk ? "border-danger" : "border-line focus:border-accent",
                    )}
                  />
                </label>
                {nick && !nickOk && (
                  <p id={idErroNick} className="mt-1.5 text-xs text-danger">
                    Nick inválido para {plataforma === "java" ? "Java" : "Bedrock"}.
                  </p>
                )}
              </div>
            </div>

            <fieldset className="mt-4">
              <legend className="sr-only">Plataforma</legend>
              <div className="grid grid-cols-2 gap-2">
              {(["java", "bedrock"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlataforma(p)}
                  aria-pressed={plataforma === p}
                  className={cn(
                    "h-11 rounded-control border text-sm font-semibold transition-colors",
                    plataforma === p
                      ? "border-accent bg-accent/12 text-accent"
                      : "border-line bg-surface-2 text-ink-muted hover:text-ink",
                  )}
                >
                  {p === "java" ? "Java" : "Bedrock"}
                </button>
              ))}
              </div>
            </fieldset>
          </Bloco>

          <Bloco titulo="Contato">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                E-mail
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                autoComplete="email"
                aria-invalid={Boolean(email) && !emailOk}
                aria-describedby={email && !emailOk ? idErroEmail : undefined}
                className={cn(
                  "h-12 w-full rounded-control border bg-surface-inset px-4 text-sm outline-none transition-colors",
                  email && !emailOk ? "border-danger" : "border-line focus:border-accent",
                )}
              />
            </label>
            {email && !emailOk && (
              <p id={idErroEmail} className="mt-1.5 text-xs text-danger">
                Digite um e-mail válido, como voce@exemplo.com.
              </p>
            )}
            <p className="mt-2 text-xs text-ink-faint">
              Usado para o recibo do Pix e para falarmos com você se algo der errado na entrega.
            </p>
          </Bloco>

          {produto.presenteavel && (
            <Bloco titulo="Presentear">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={presentear}
                  onChange={(e) => setPresentear(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-sm text-ink-muted">
                  Esta compra é um presente para outro jogador
                </span>
              </label>

              {presentear && (
                <>
                <label className="mt-4 block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Nick de quem vai receber
                  </span>
                  <input
                    value={nickPresenteado}
                    onChange={(e) => setNickPresenteado(e.target.value)}
                    placeholder="NickDoAmigo"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(nickPresenteado) && !presenteOk}
                    aria-describedby={nickPresenteado && !presenteOk ? idErroPresente : undefined}
                    className={cn(
                      "h-12 w-full rounded-control border bg-surface-inset px-4 text-sm outline-none transition-colors",
                      nickPresenteado && !presenteOk
                        ? "border-danger"
                        : "border-line focus:border-accent",
                    )}
                  />
                </label>
                {nickPresenteado && !presenteOk && (
                  <p id={idErroPresente} className="mt-1.5 text-xs text-danger">
                    Nick inválido. Confira com quem vai receber o presente.
                  </p>
                )}
                </>
              )}
            </Bloco>
          )}
        </div>

        <aside className="lg:sticky lg:top-20">
          <div className="rounded-card border border-line bg-surface-1 p-5 shadow-card">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-muted">
              Resumo
            </h2>

            <div className="mt-4 flex gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-surface-inset p-2.5 text-ink-faint">
                <IconeCategoria nome={produto.categoriaSlug} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold leading-snug">{produto.nome}</p>
                <p className="tabular text-xs text-ink-muted">
                  {qtd} × {formatarBRL(precoUnitario)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-sm text-ink-muted">Total</span>
              <span className="tabular font-display text-2xl font-extrabold text-accent">
                {formatarBRL(total)}
              </span>
            </div>

            {config?.turnstileSiteKey && (
              <div className="mt-4">
                <Turnstile siteKey={config.turnstileSiteKey} aoResolver={setTurnstileToken} />
              </div>
            )}

            {erro && (
              <p role="alert" className="mt-4 rounded-control border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
                {erro}
              </p>
            )}

            <Botao tamanho="lg" className="mt-5 w-full" disabled={!podeEnviar} onClick={enviar}>
              {enviando ? "Gerando Pix..." : "Gerar Pix"}
            </Botao>

            <div className="mt-4 flex gap-2.5 border-t border-line pt-4">
              <span className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted">
                <IconeInfo />
              </span>
              <p className="text-xs leading-relaxed text-ink-muted">
                {config?.avisoEntrega ??
                  "A entrega é feita manualmente pela equipe após a confirmação do Pix."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface-1 p-5">
      <h2 className="mb-4 font-display text-base font-bold">{titulo}</h2>
      {children}
    </section>
  );
}

function Aviso({ titulo, acao }: { titulo: string; acao: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-28 text-center">
      <h1 className="font-display text-2xl font-bold">{titulo}</h1>
      <Link to="/loja" className="mt-6 inline-block text-sm font-semibold text-accent">
        {acao}
      </Link>
    </div>
  );
}
