/**
 * Ícones em SVG inline. Nenhuma dependência externa: um punhado de ícones não
 * justifica uma biblioteca, e inline evita um flash de ícone faltando.
 */
type Props = { className?: string };

const base = "h-full w-full";

export function IconeCoroa({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconeMoedas({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <ellipse cx="12" cy="7" rx="7" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconeCaixa({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 7.2L12 11.5l8-4.3M12 11.5V21" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconeChave({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="15.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12.3 11.7L4 20m2.2-2.2l2.2 2.2m-.5-4.4l2.2 2.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconeInfo({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function IconeCopiar({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M15 5.5A2.5 2.5 0 0012.5 3h-7A2.5 2.5 0 003 5.5v7A2.5 2.5 0 005.5 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconeCheque({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.5 12.5l5 5 10-11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconeCarrinho({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 4h2l2.2 10.2a2 2 0 002 1.6h7.1a2 2 0 002-1.5L20 8H6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="19.5" r="1.4" fill="currentColor" />
      <circle cx="17" cy="19.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconeUsuario({ className = base }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const MAPA = {
  crown: IconeCoroa,
  coins: IconeMoedas,
  package: IconeCaixa,
  key: IconeChave,
  // Aceita também o slug da categoria, para o card de produto não precisar
  // carregar o campo "icone" junto.
  vip: IconeCoroa,
  cash: IconeMoedas,
  kits: IconeCaixa,
  chaves: IconeChave,
} as const;

/** Ícone da categoria, com a caixa como padrão para slugs desconhecidos. */
export function IconeCategoria({ nome, className }: { nome: string | null; className?: string }) {
  const Componente = MAPA[nome as keyof typeof MAPA] ?? IconeCaixa;
  return <Componente className={className} />;
}
