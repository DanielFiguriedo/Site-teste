import { useCallback, useEffect, useState } from "react";
import type { Category, Product } from "@shared/types";
import { formatBRL } from "@shared/money";
import { api, apiUpload } from "../lib/api";
import { useModal } from "../lib/modal";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { CategoryIcon } from "../components/Icons";
import { cn } from "../lib/cn";

type AdminProduct = Product & { active: boolean };

/** Parses "19,90" (or "19.90") into 1990 cents. */
function toCents(text: string): number {
  const clean = text.replace(/[^\d,.]/g, "").replace(",", ".");
  return Math.round((Number(clean) || 0) * 100);
}

/** Renders 1990 as "19,90", to prefill the form. */
function toText(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

export function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [productList, categoryList] = await Promise.all([
        api<AdminProduct[]>("/admin/products"),
        api<Category[]>("/admin/categories"),
      ]);
      setProducts(productList);
      setCategories(categoryList);
    } catch (e) {
      // Without this catch, a network failure would leave the screen stuck on
      // the skeleton forever, saying nothing about what happened.
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">Produtos</h1>
          <p className="mt-1 text-sm text-ink-muted">
            O que aparece na loja. Mudanças valem na hora, sem publicar nada.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>Novo produto</Button>
      </div>

      <div className="mt-6 space-y-2">
        {loading &&
          Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-[4.5rem] animate-pulse rounded-card bg-surface-1" />
          ))}

        {error && (
          <p
            role="alert"
            className="rounded-card border border-danger/25 bg-danger/10 p-4 text-sm text-danger"
          >
            Não foi possível carregar os produtos: {error}
          </p>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="rounded-card border border-line bg-surface-1 p-8 text-center text-sm text-ink-muted">
            Nenhum produto cadastrado ainda. Comece por &ldquo;Novo produto&rdquo;.
          </p>
        )}

        {!loading &&
          products.map((product) => (
            <button
              key={product.id}
              onClick={() => setEditing(product)}
              className={cn(
                "flex w-full items-center gap-4 rounded-card border border-line bg-surface-1 p-3 text-left",
                "transition-colors hover:border-line-strong",
                !product.active && "opacity-55",
              )}
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-control bg-surface-inset">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="h-6 w-6 text-ink-faint">
                    <CategoryIcon name={product.categorySlug} />
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-display text-sm font-bold">{product.name}</span>
                <span className="block text-xs text-ink-muted">
                  {product.categoryName}
                  {product.stock !== null && ` · estoque ${product.stock}`}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-3">
                {!product.active && <Badge tone="neutral">inativo</Badge>}
                {product.featured && <Badge tone="accent">destaque</Badge>}
                <span className="tabular font-display text-sm font-bold text-accent">
                  {product.payWhatYouWant ? "livre" : formatBRL(product.priceCents)}
                </span>
              </span>
            </button>
          ))}
      </div>

      {editing && (
        <Editor
          product={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Editor({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    categoryId: product?.categoryId ?? categories[0]?.id ?? 1,
    name: product?.name ?? "",
    shortDescription: product?.shortDescription ?? "",
    descriptionMd: product?.descriptionMd ?? "",
    price: toText(product?.priceCents ?? null),
    originalPrice: toText(product?.originalPriceCents ?? null),
    durationDays: product?.durationDays?.toString() ?? "",
    stock: product?.stock?.toString() ?? "",
    imageKey: product?.imageUrl?.replace("/api/images/", "") ?? "",
    imageUrl: product?.imageUrl ?? "",
    featured: product?.featured ?? false,
    giftable: product?.giftable ?? true,
    payWhatYouWant: product?.payWhatYouWant ?? false,
    active: product?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string>();
  const box = useModal(true, onClose);

  const update = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  const uploadImage = async (file: File) => {
    const data = new FormData();
    data.append("file", file);
    try {
      const { key, url } = await apiUpload<{ key: string; url: string }>("/admin/upload", data);
      setForm((current) => ({ ...current, imageKey: key, imageUrl: url }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);

    const body = {
      categoryId: form.categoryId,
      name: form.name.trim(),
      shortDescription: form.shortDescription.trim() || null,
      descriptionMd: form.descriptionMd.trim() || null,
      priceCents: toCents(form.price),
      originalPriceCents: form.originalPrice ? toCents(form.originalPrice) : null,
      durationDays: form.durationDays ? Number(form.durationDays) : null,
      stock: form.stock === "" ? null : Number(form.stock),
      imageKey: form.imageKey || null,
      featured: form.featured,
      giftable: form.giftable,
      payWhatYouWant: form.payWhatYouWant,
      active: form.active,
    };

    try {
      if (product) {
        await api(`/admin/products/${product.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/admin/products", { method: "POST", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await api(`/admin/products/${product.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-surface-0/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={box}
        className="mx-auto my-8 w-full max-w-xl rounded-card border border-line-strong bg-surface-1 p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-editor-title"
      >
        <h2 id="product-editor-title" className="font-display text-xl font-bold">
          {product ? "Editar produto" : "Novo produto"}
        </h2>

        <div className="mt-5 space-y-4">
          <Field label="Nome">
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="VIP OURO [30 DIAS]"
              className={input}
            />
          </Field>

          <Field label="Categoria">
            <select
              value={form.categoryId}
              onChange={(e) => update("categoryId", Number(e.target.value))}
              className={input}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Preço (R$)">
              <input
                inputMode="decimal"
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                placeholder="19,90"
                className={cn(input, "tabular")}
              />
            </Field>
            <Field label="Preço de (riscado)">
              <input
                inputMode="decimal"
                value={form.originalPrice}
                onChange={(e) => update("originalPrice", e.target.value)}
                placeholder="34,90"
                className={cn(input, "tabular")}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Duração em dias" hint="Vazio = permanente">
              <input
                inputMode="numeric"
                value={form.durationDays}
                onChange={(e) => update("durationDays", e.target.value.replace(/\D/g, ""))}
                placeholder="30"
                className={cn(input, "tabular")}
              />
            </Field>
            <Field label="Estoque" hint="Vazio = ilimitado">
              <input
                inputMode="numeric"
                value={form.stock}
                onChange={(e) => update("stock", e.target.value.replace(/\D/g, ""))}
                placeholder="ilimitado"
                className={cn(input, "tabular")}
              />
            </Field>
          </div>

          <Field label="Descrição curta" hint="Aparece no card da loja">
            <input
              value={form.shortDescription}
              onChange={(e) => update("shortDescription", e.target.value)}
              maxLength={200}
              className={input}
            />
          </Field>

          <Field label="Descrição completa" hint="Markdown: ### título, - item, **negrito**">
            <textarea
              value={form.descriptionMd}
              onChange={(e) => update("descriptionMd", e.target.value)}
              rows={7}
              placeholder={"### Você vai receber\n- Cargo **VIP OURO** por 30 dias"}
              className={cn(input, "h-auto py-3 font-mono text-xs leading-relaxed")}
            />
          </Field>

          <Field label="Imagem" hint="PNG, JPG, WEBP ou GIF, até 2 MB">
            <div className="flex items-center gap-3">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-surface-inset">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-ink-faint">sem</span>
                )}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadImage(file);
                }}
                className="text-xs text-ink-muted file:mr-3 file:rounded-control file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink"
              />
            </div>
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle label="Ativo na loja" value={form.active} onChange={(v) => update("active", v)} />
            <Toggle
              label="Em destaque"
              value={form.featured}
              onChange={(v) => update("featured", v)}
            />
            <Toggle
              label="Pode presentear"
              value={form.giftable}
              onChange={(v) => update("giftable", v)}
            />
            <Toggle
              label="Valor livre (doação)"
              value={form.payWhatYouWant}
              onChange={(v) => update("payWhatYouWant", v)}
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-control border border-danger/25 bg-danger/10 p-3 text-xs text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {/* Deletion takes two clicks: it is irreversible for a product that
              has never been sold. */}
          {product &&
            (confirmingDelete ? (
              <Button variant="danger" onClick={remove} disabled={saving}>
                Confirmar exclusão
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmingDelete(true)} disabled={saving}>
                Excluir
              </Button>
            ))}

          <Button variant="secondary" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const input =
  "h-11 w-full rounded-control border border-line bg-surface-inset px-3 text-sm text-ink " +
  "outline-none transition-colors focus:border-accent placeholder:text-ink-faint";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
        {hint && <span className="text-[0.6875rem] text-ink-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface-2 px-3 py-2.5">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      <span className="text-sm text-ink-muted">{label}</span>
    </label>
  );
}
