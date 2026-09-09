import { useCallback, useEffect, useRef, useState } from "react";

/** Copia texto e sinaliza "copiado" por 2 segundos, para dar feedback visual. */
export function useCopiar() {
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copiar = useCallback(async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // clipboard API exige contexto seguro; fora dele, o fallback antigo serve.
      const campo = document.createElement("textarea");
      campo.value = texto;
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      campo.remove();
    }
    setCopiado(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiado(false), 2000);
  }, []);

  return { copiado, copiar };
}
