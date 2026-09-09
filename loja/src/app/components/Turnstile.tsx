import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement,
        options: {
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
 * Cloudflare Turnstile anti-bot widget.
 *
 * Without it a script could create thousands of Pix charges per minute, which
 * pollutes the gateway dashboard and can get the account suspended. The widget
 * only renders when a site key exists, so development stays usable with nothing
 * configured.
 */
export function Turnstile({
  siteKey,
  onResolve,
}: {
  siteKey: string;
  onResolve: (token: string | null) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  // Kept in a ref because the widget callback is registered once and must not
  // capture the first version of the function.
  const callback = useRef(onResolve);
  callback.current = onResolve;

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !target.current || !window.turnstile) return;
      widgetId = window.turnstile.render(target.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => callback.current(token),
        "expired-callback": () => callback.current(null),
        "error-callback": () => callback.current(null),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      // A single script tag for the whole page, even if the component mounts
      // and unmounts several times.
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={target} className="min-h-[65px]" />;
}
