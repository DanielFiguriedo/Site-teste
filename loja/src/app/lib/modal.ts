import { useEffect, useRef } from "react";

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamento de teclado de um modal: fecha no Escape, leva o foco para
 * dentro ao abrir, prende o Tab lá e devolve o foco a quem abriu.
 *
 * Sem prender o foco, o Tab escapa para o header atrás do modal e quem navega
 * por teclado fica preenchendo um formulário que não vê.
 */
export function useModal(aberto: boolean, aoFechar: () => void) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    const anterior = document.activeElement as HTMLElement | null;
    const primeiro = caixa.current?.querySelector<HTMLElement>(FOCAVEIS);
    primeiro?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        aoFechar();
        return;
      }
      if (e.key !== "Tab" || !caixa.current) return;

      const focaveis = [...caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS)];
      if (focaveis.length === 0) return;

      const inicio = focaveis[0];
      const fim = focaveis[focaveis.length - 1];

      if (e.shiftKey && document.activeElement === inicio) {
        e.preventDefault();
        fim.focus();
      } else if (!e.shiftKey && document.activeElement === fim) {
        e.preventDefault();
        inicio.focus();
      }
    };

    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      anterior?.focus();
    };
  }, [aberto, aoFechar]);

  return caixa;
}
