import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        alvo: HTMLElement,
        opcoes: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Widget anti-robô do Cloudflare Turnstile.
 *
 * Sem ele, um script criaria milhares de cobranças Pix por minuto — o que suja
 * o painel do gateway e pode derrubar a conta. O componente só aparece quando
 * há `siteKey`, para o ambiente de desenvolvimento seguir utilizável sem
 * configurar nada.
 */
export function Turnstile({
  siteKey,
  aoResolver,
}: {
  siteKey: string;
  aoResolver: (token: string | null) => void;
}) {
  const alvo = useRef<HTMLDivElement>(null);
  // Guardado em ref porque o callback do widget é registrado uma vez só e não
  // deve prender a primeira versão da função.
  const callback = useRef(aoResolver);
  callback.current = aoResolver;

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelado = false;

    const renderizar = () => {
      if (cancelado || !alvo.current || !window.turnstile) return;
      widgetId = window.turnstile.render(alvo.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => callback.current(token),
        "expired-callback": () => callback.current(null),
        "error-callback": () => callback.current(null),
      });
    };

    if (window.turnstile) {
      renderizar();
    } else {
      // Um único <script> para a página inteira, mesmo que o componente monte
      // e desmonte várias vezes.
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderizar);
    }

    return () => {
      cancelado = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={alvo} className="min-h-[65px]" />;
}
