import { Fragment, type ReactNode } from "react";

/**
 * Renderizador de markdown mínimo, suficiente para as descrições de produto
 * (título, lista, negrito, código).
 *
 * Escrito à mão de propósito: ele produz elementos React, nunca HTML cru. Como
 * o texto vem do painel administrativo e acaba numa página pública, usar
 * `dangerouslySetInnerHTML` com um parser genérico abriria espaço para XSS.
 */

function inline(texto: string, chave: string): ReactNode {
  // Quebra em **negrito** e `código`, preservando o resto como texto puro.
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return partes.map((parte, i) => {
    const k = `${chave}-${i}`;
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) {
      return (
        <strong key={k} className="font-semibold text-ink">
          {parte.slice(2, -2)}
        </strong>
      );
    }
    if (parte.startsWith("`") && parte.endsWith("`") && parte.length > 2) {
      return (
        <code
          key={k}
          className="rounded-control bg-surface-inset px-1.5 py-0.5 font-mono text-[0.85em] text-ink"
        >
          {parte.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={k}>{parte}</Fragment>;
  });
}

export function Markdown({ texto, nivel = 2 }: { texto: string; nivel?: 2 | 3 }) {
  const Titulo = (nivel === 2 ? "h2" : "h3") as "h2" | "h3";
  const linhas = texto.split("\n");
  const blocos: ReactNode[] = [];
  let listaAberta: string[] = [];

  const fecharLista = () => {
    if (listaAberta.length === 0) return;
    const itens = listaAberta;
    listaAberta = [];
    blocos.push(
      <ul key={`ul-${blocos.length}`} className="my-3 space-y-2">
        {itens.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
            <span aria-hidden="true" className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" />
            <span>{inline(item, `li-${blocos.length}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const linha of linhas) {
    const texto = linha.trim();

    if (texto.startsWith("- ")) {
      listaAberta.push(texto.slice(2));
      continue;
    }
    fecharLista();

    if (texto === "") continue;

    if (texto.startsWith("### ")) {
      blocos.push(
        <Titulo
          key={`h-${blocos.length}`}
          className="mt-5 font-display text-base font-bold text-ink first:mt-0"
        >
          {texto.slice(4)}
        </Titulo>,
      );
      continue;
    }

    blocos.push(
      <p key={`p-${blocos.length}`} className="my-2 text-sm leading-relaxed text-ink-muted">
        {inline(texto, `p-${blocos.length}`)}
      </p>,
    );
  }
  fecharLista();

  return <div>{blocos}</div>;
}
