import { useCallback, useEffect, useState } from "react";
import type { Categoria, Produto } from "@shared/types";
import { formatarBRL } from "@shared/dinheiro";
import { api, apiUpload } from "../lib/api";
import { useModal } from "../lib/modal";
import { Botao } from "../components/Botao";
import { Selo } from "../components/Selo";
import { IconeCategoria } from "../components/Icones";
import { cn } from "../lib/cn";

type ProdutoAdmin = Produto & { ativo: boolean };

/** Converte "19,90" (ou "19.90") para 1990 centavos. */
function paraCentavos(texto: string): number {
  const limpo = texto.replace(/[^\d,.]/g, "").replace(",", ".");
  return Math.round((Number(limpo) || 0) * 100);
}

/** Converte 1990 para "19,90", para preencher o formulário. */
function paraTexto(centavos: number | null): string {
  return centavos == null ? "" : (centavos / 100).toFixed(2).replace(".", ",");
}

export function ProdutosAdmin() {
  const [produtos, setProdutos] = useState<ProdutoAdmin[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [editando, setEditando] = useState<ProdutoAdmin | "novo" | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string>();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(undefined);
    try {
      const [listaProdutos, listaCategorias] = await Promise.all([
        api<ProdutoAdmin[]>("/admin/produtos"),
        api<Categoria[]>("/admin/categorias"),
      ]);
      setProdutos(listaProdutos);
      setCategorias(listaCategorias);
    } catch (e) {
      // Sem este catch, uma falha de rede deixaria a tela no esqueleto para
      // sempre, sem dizer o que aconteceu.
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Produtos</h1>
          <p className="mt-1 text-sm text-ink-muted">
            O que aparece na loja. Mudanças valem na hora, sem publicar nada.
          </p>
        </div>
        <Botao onClick={() => setEditando("novo")}>Novo produto</Botao>
      </div>

      <div className="mt-6 space-y-2">
        {carregando &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[4.5rem] animate-pulse rounded-card bg-surface-1" />
          ))}

        {erro && (
          <p
            role="alert"
            className="rounded-card border border-danger/25 bg-danger/10 p-4 text-sm text-danger"
          >
            Não foi possível carregar os produtos: {erro}
          </p>
        )}

        {!carregando && !erro && produtos.length === 0 && (
          <p className="rounded-card border border-line bg-surface-1 p-8 text-center text-sm text-ink-muted">
            Nenhum produto cadastrado ainda. Comece por &ldquo;Novo produto&rdquo;.
          </p>
        )}

        {!carregando &&
          produtos.map((p) => (
            <button
              key={p.id}
              onClick={() => setEditando(p)}
              className={cn(
                "flex w-full items-center gap-4 rounded-card border border-line bg-surface-1 p-3 text-left",
                "transition-colors hover:border-line-strong",
                !p.ativo && "opacity-55",
              )}
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-control bg-surface-inset">
                {p.imagemUrl ? (
                  <img src={p.imagemUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="h-6 w-6 text-ink-faint">
                    <IconeCategoria nome={p.categoriaSlug} />
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm font-bold">{p.nome}</span>
                <span className="block text-xs text-ink-muted">
                  {p.categoriaNome}
                  {p.estoque !== null && ` · estoque ${p.estoque}`}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-3">
                {!p.ativo && <Selo tom="neutro">inativo</Selo>}
                {p.destaque && <Selo tom="accent">destaque</Selo>}
                <span className="tabular font-display text-sm font-bold text-accent">
                  {p.precoLivre ? "livre" : formatarBRL(p.precoCentavos)}
                </span>
              </span>
            </button>
          ))}
      </div>

      {editando && (
        <Editor
          produto={editando === "novo" ? null : editando}
          categorias={categorias}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

function Editor({
  produto,
  categorias,
  aoFechar,
  aoSalvar,
}: {
  produto: ProdutoAdmin | null;
  categorias: Categoria[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [form, setForm] = useState({
    categoriaId: produto?.categoriaId ?? categorias[0]?.id ?? 1,
    nome: produto?.nome ?? "",
    descricaoCurta: produto?.descricaoCurta ?? "",
    descricaoMd: produto?.descricaoMd ?? "",
    preco: paraTexto(produto?.precoCentavos ?? null),
    precoDe: paraTexto(produto?.precoDeCentavos ?? null),
    duracaoDias: produto?.duracaoDias?.toString() ?? "",
    estoque: produto?.estoque?.toString() ?? "",
    imagemKey: produto?.imagemUrl?.replace("/api/imagens/", "") ?? "",
    imagemUrl: produto?.imagemUrl ?? "",
    destaque: produto?.destaque ?? false,
    presenteavel: produto?.presenteavel ?? true,
    precoLivre: produto?.precoLivre ?? false,
    ativo: produto?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState<string>();
  const caixa = useModal(true, aoFechar);

  const atualizar = <C extends keyof typeof form>(campo: C, valor: (typeof form)[C]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const enviarImagem = async (arquivo: File) => {
    const dados = new FormData();
    dados.append("arquivo", arquivo);
    try {
      const { key, url } = await apiUpload<{ key: string; url: string }>("/admin/upload", dados);
      setForm((f) => ({ ...f, imagemKey: key, imagemUrl: url }));
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(undefined);

    const corpo = {
      categoriaId: form.categoriaId,
      nome: form.nome.trim(),
      descricaoCurta: form.descricaoCurta.trim() || null,
      descricaoMd: form.descricaoMd.trim() || null,
      precoCentavos: paraCentavos(form.preco),
      precoDeCentavos: form.precoDe ? paraCentavos(form.precoDe) : null,
      duracaoDias: form.duracaoDias ? Number(form.duracaoDias) : null,
      estoque: form.estoque === "" ? null : Number(form.estoque),
      imagemKey: form.imagemKey || null,
      destaque: form.destaque,
      presenteavel: form.presenteavel,
      precoLivre: form.precoLivre,
      ativo: form.ativo,
    };

    try {
      if (produto) {
        await api(`/admin/produtos/${produto.id}`, { method: "PUT", body: JSON.stringify(corpo) });
      } else {
        await api("/admin/produtos", { method: "POST", body: JSON.stringify(corpo) });
      }
      aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!produto) return;
    setSalvando(true);
    try {
      await api(`/admin/produtos/${produto.id}`, { method: "DELETE" });
      aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-surface-0/80 p-4 backdrop-blur-sm"
      onClick={aoFechar}
      role="presentation"
    >
      <div
        ref={caixa}
        className="mx-auto my-8 w-full max-w-xl rounded-card border border-line-strong bg-surface-1 p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-editor"
      >
        <h2 id="titulo-editor" className="font-display text-xl font-bold">
          {produto ? "Editar produto" : "Novo produto"}
        </h2>

        <div className="mt-5 space-y-4">
          <Campo rotulo="Nome">
            <input
              value={form.nome}
              onChange={(e) => atualizar("nome", e.target.value)}
              placeholder="VIP OURO [30 DIAS]"
              className={entrada}
            />
          </Campo>

          <Campo rotulo="Categoria">
            <select
              value={form.categoriaId}
              onChange={(e) => atualizar("categoriaId", Number(e.target.value))}
              className={entrada}
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Preço (R$)">
              <input
                inputMode="decimal"
                value={form.preco}
                onChange={(e) => atualizar("preco", e.target.value)}
                placeholder="19,90"
                className={cn(entrada, "tabular")}
              />
            </Campo>
            <Campo rotulo="Preço de (riscado)">
              <input
                inputMode="decimal"
                value={form.precoDe}
                onChange={(e) => atualizar("precoDe", e.target.value)}
                placeholder="34,90"
                className={cn(entrada, "tabular")}
              />
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Duração em dias" dica="Vazio = permanente">
              <input
                inputMode="numeric"
                value={form.duracaoDias}
                onChange={(e) => atualizar("duracaoDias", e.target.value.replace(/\D/g, ""))}
                placeholder="30"
                className={cn(entrada, "tabular")}
              />
            </Campo>
            <Campo rotulo="Estoque" dica="Vazio = ilimitado">
              <input
                inputMode="numeric"
                value={form.estoque}
                onChange={(e) => atualizar("estoque", e.target.value.replace(/\D/g, ""))}
                placeholder="ilimitado"
                className={cn(entrada, "tabular")}
              />
            </Campo>
          </div>

          <Campo rotulo="Descrição curta" dica="Aparece no card da loja">
            <input
              value={form.descricaoCurta}
              onChange={(e) => atualizar("descricaoCurta", e.target.value)}
              maxLength={200}
              className={entrada}
            />
          </Campo>

          <Campo rotulo="Descrição completa" dica="Markdown: ### título, - item, **negrito**">
            <textarea
              value={form.descricaoMd}
              onChange={(e) => atualizar("descricaoMd", e.target.value)}
              rows={7}
              placeholder={"### Você vai receber\n- Cargo **VIP OURO** por 30 dias"}
              className={cn(entrada, "h-auto py-3 font-mono text-xs leading-relaxed")}
            />
          </Campo>

          <Campo rotulo="Imagem" dica="PNG, JPG, WEBP ou GIF, até 2 MB">
            <div className="flex items-center gap-3">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-surface-inset">
                {form.imagemUrl ? (
                  <img src={form.imagemUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-ink-faint">sem</span>
                )}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) void enviarImagem(arquivo);
                }}
                className="text-xs text-ink-muted file:mr-3 file:rounded-control file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink"
              />
            </div>
          </Campo>

          <div className="grid gap-2 sm:grid-cols-2">
            <Marcador rotulo="Ativo na loja" valor={form.ativo} aoMudar={(v) => atualizar("ativo", v)} />
            <Marcador
              rotulo="Em destaque"
              valor={form.destaque}
              aoMudar={(v) => atualizar("destaque", v)}
            />
            <Marcador
              rotulo="Pode presentear"
              valor={form.presenteavel}
              aoMudar={(v) => atualizar("presenteavel", v)}
            />
            <Marcador
              rotulo="Valor livre (doação)"
              valor={form.precoLivre}
              aoMudar={(v) => atualizar("precoLivre", v)}
            />
          </div>
        </div>

        {erro && (
          <p
            role="alert"
            className="mt-4 rounded-control border border-danger/25 bg-danger/10 p-3 text-xs text-danger"
          >
            {erro}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {/* Exclusão exige dois cliques: é irreversível para um produto que
              nunca foi vendido. */}
          {produto &&
            (confirmandoExclusao ? (
              <Botao variante="perigo" onClick={remover} disabled={salvando}>
                Confirmar exclusão
              </Botao>
            ) : (
              <Botao
                variante="fantasma"
                onClick={() => setConfirmandoExclusao(true)}
                disabled={salvando}
              >
                Excluir
              </Botao>
            ))}

          <Botao variante="secundario" className="ml-auto" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} disabled={salvando || !form.nome.trim()}>
            {salvando ? "Salvando..." : "Salvar"}
          </Botao>
        </div>
      </div>
    </div>
  );
}

const entrada =
  "h-11 w-full rounded-control border border-line bg-surface-inset px-3 text-sm text-ink " +
  "outline-none transition-colors focus:border-accent placeholder:text-ink-faint";

function Campo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {rotulo}
        </span>
        {dica && <span className="text-[0.6875rem] text-ink-faint">{dica}</span>}
      </span>
      {children}
    </label>
  );
}

function Marcador({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface-2 px-3 py-2.5">
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => aoMudar(e.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      <span className="text-sm text-ink-muted">{rotulo}</span>
    </label>
  );
}
