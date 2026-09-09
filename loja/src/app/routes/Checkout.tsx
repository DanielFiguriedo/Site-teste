import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Platform, Product } from "@shared/types";
import { formatBRL } from "@shared/money";
import { api, useApi } from "../lib/api";
import { isValidNick, usePlayer } from "../lib/player";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { useStore } from "../lib/store-context";
import { Button } from "../components/Button";
import { CategoryIcon, InfoIcon } from "../components/Icons";
import { Turnstile } from "../components/Turnstile";
import { cn } from "../lib/cn";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { settings } = useStore();
  const { player, save } = usePlayer();

  const slug = params.get("product");
  const quantity = Math.max(1, Number(params.get("qty") ?? 1));
  const freeAmountCents = Number(params.get("amount") ?? 0);

  const { data: product, loading, error: loadError } = useApi<Product>(
    slug ? `/products/${slug}` : null,
  );

  const [nick, setNick] = useState(player?.nick ?? "");
  const [platform, setPlatform] = useState<Platform>(player?.platform ?? "java");
  const [email, setEmail] = useState("");
  const [gifting, setGifting] = useState(false);
  const [recipientNick, setRecipientNick] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const nickErrorId = useId();
  const emailErrorId = useId();
  const recipientErrorId = useId();

  // The saved nick can arrive after the first render (localStorage is read on
  // mount, but the hook revalidates on `storage`).
  useEffect(() => {
    if (player && !nick) {
      setNick(player.nick);
      setPlatform(player.platform);
    }
  }, [player, nick]);

  if (!slug) return <Notice title="Nenhum produto selecionado" action="Escolher um produto" />;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-12">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-5">
            <div className="h-48 animate-pulse rounded-card bg-surface-1" />
            <div className="h-36 animate-pulse rounded-card bg-surface-1" />
          </div>
          <div className="h-64 animate-pulse rounded-card bg-surface-1" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <Notice
        title={loadError ? "Não foi possível carregar o produto" : "Produto não encontrado"}
        action="Voltar para a loja"
      />
    );
  }

  const unitPrice = product.payWhatYouWant ? freeAmountCents : product.priceCents;
  const qty = product.payWhatYouWant ? 1 : quantity;
  const total = unitPrice * qty;

  const nickOk = isValidNick(nick, platform);
  const emailOk = EMAIL_PATTERN.test(email.trim());
  const recipientOk = !gifting || isValidNick(recipientNick, platform);
  // When Turnstile is configured the button only unlocks with a token — the
  // server would reject it anyway, and blocking here avoids losing the form.
  const turnstileOk = !settings?.turnstileSiteKey || turnstileToken !== null;
  const canSubmit = nickOk && emailOk && recipientOk && turnstileOk && total > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(undefined);

    // Save the nick for next time — retyping it is the chance to get it wrong.
    save({ nick: nick.trim(), platform });

    try {
      const response = await api<{ publicId: string }>("/checkout", {
        method: "POST",
        body: JSON.stringify({
          productSlug: product.slug,
          quantity: qty,
          ...(product.payWhatYouWant ? { amountCents: freeAmountCents } : {}),
          nick: nick.trim(),
          platform,
          email: email.trim(),
          ...(gifting ? { recipientNick: recipientNick.trim() } : {}),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      navigate(`/order/${response.publicId}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
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
          <Block title="Quem vai receber">
            <div className="flex items-start gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-surface-inset">
                {nickOk ? (
                  <PlayerAvatar nick={nick.trim()} size={54} />
                ) : (
                  <span className="text-xs text-ink-faint" aria-hidden="true">
                    ?
                  </span>
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
                    aria-describedby={nick && !nickOk ? nickErrorId : undefined}
                    className={cn(
                      "h-14 w-full rounded-control border bg-surface-inset px-4",
                      "font-display text-lg font-semibold outline-none transition-colors",
                      nick && !nickOk ? "border-danger" : "border-line focus:border-accent",
                    )}
                  />
                </label>
                {nick && !nickOk && (
                  <p id={nickErrorId} className="mt-1.5 text-xs text-danger">
                    Nick inválido para {platform === "java" ? "Java" : "Bedrock"}.
                  </p>
                )}
              </div>
            </div>

            <fieldset className="mt-4">
              <legend className="sr-only">Plataforma</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["java", "bedrock"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPlatform(option)}
                    aria-pressed={platform === option}
                    className={cn(
                      "h-11 rounded-control border text-sm font-semibold transition-colors",
                      platform === option
                        ? "border-accent bg-accent/12 text-accent"
                        : "border-line bg-surface-2 text-ink-muted hover:text-ink",
                    )}
                  >
                    {option === "java" ? "Java" : "Bedrock"}
                  </button>
                ))}
              </div>
            </fieldset>
          </Block>

          <Block title="Contato">
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
                aria-describedby={email && !emailOk ? emailErrorId : undefined}
                className={cn(
                  "h-12 w-full rounded-control border bg-surface-inset px-4 text-sm outline-none transition-colors",
                  email && !emailOk ? "border-danger" : "border-line focus:border-accent",
                )}
              />
            </label>
            {email && !emailOk && (
              <p id={emailErrorId} className="mt-1.5 text-xs text-danger">
                Digite um e-mail válido, como voce@exemplo.com.
              </p>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              Usado para o recibo do Pix e para falarmos com você se algo der errado na entrega.
            </p>
          </Block>

          {product.giftable && (
            <Block title="Presentear">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={gifting}
                  onChange={(e) => setGifting(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-sm text-ink-muted">
                  Esta compra é um presente para outro jogador
                </span>
              </label>

              {gifting && (
                <>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Nick de quem vai receber
                    </span>
                    <input
                      value={recipientNick}
                      onChange={(e) => setRecipientNick(e.target.value)}
                      placeholder="NickDoAmigo"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={Boolean(recipientNick) && !recipientOk}
                      aria-describedby={
                        recipientNick && !recipientOk ? recipientErrorId : undefined
                      }
                      className={cn(
                        "h-12 w-full rounded-control border bg-surface-inset px-4 text-sm outline-none transition-colors",
                        recipientNick && !recipientOk
                          ? "border-danger"
                          : "border-line focus:border-accent",
                      )}
                    />
                  </label>
                  {recipientNick && !recipientOk && (
                    <p id={recipientErrorId} className="mt-1.5 text-xs text-danger">
                      Nick inválido. Confira com quem vai receber o presente.
                    </p>
                  )}
                </>
              )}
            </Block>
          )}
        </div>

        <aside className="lg:sticky lg:top-20">
          <div className="rounded-card border border-line bg-surface-1 p-5 shadow-card">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-muted">
              Resumo
            </h2>

            <div className="mt-4 flex gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-surface-inset p-2.5 text-ink-faint">
                <CategoryIcon name={product.categorySlug} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold leading-snug">{product.name}</p>
                <p className="tabular text-xs text-ink-muted">
                  {qty} × {formatBRL(unitPrice)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-sm text-ink-muted">Total</span>
              <span className="tabular font-display text-2xl font-extrabold text-accent">
                {formatBRL(total)}
              </span>
            </div>

            {settings?.turnstileSiteKey && (
              <div className="mt-4">
                <Turnstile siteKey={settings.turnstileSiteKey} onResolve={setTurnstileToken} />
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-control border border-danger/25 bg-danger/10 p-3 text-xs text-danger"
              >
                {error}
              </p>
            )}

            <Button size="lg" className="mt-5 w-full" disabled={!canSubmit} onClick={submit}>
              {submitting ? "Gerando Pix..." : "Gerar Pix"}
            </Button>

            <div className="mt-4 flex gap-2.5 border-t border-line pt-4">
              <span className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted">
                <InfoIcon />
              </span>
              <p className="text-xs leading-relaxed text-ink-muted">
                {settings?.deliveryNotice ??
                  "A entrega é feita manualmente pela equipe após a confirmação do Pix."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface-1 p-5">
      <h2 className="mb-4 font-display text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ title, action }: { title: string; action: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-28 text-center">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <Link to="/shop" className="mt-6 inline-block text-sm font-semibold text-accent">
        {action}
      </Link>
    </div>
  );
}
