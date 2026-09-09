import { useEffect, useState } from "react";
import { urlAvatar } from "../lib/nick";
import { IconeUsuario } from "./Icones";
import { cn } from "../lib/cn";

/**
 * Cabeça do jogador.
 *
 * O avatar vem de um serviço público de terceiros, que pode estar fora do ar ou
 * limitar requisições. Quando isso acontece, cai no ícone genérico em vez de
 * deixar um quadrado vazio na tela — o que parece defeito da loja.
 */
export function AvatarNick({
  nick,
  tamanho = 56,
  className,
}: {
  nick: string;
  tamanho?: number;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);

  // Trocar de nick precisa dar nova chance ao carregamento.
  useEffect(() => setFalhou(false), [nick]);

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden bg-surface-inset",
        className,
      )}
      style={{ width: tamanho, height: tamanho }}
    >
      {falhou ? (
        <span className="h-1/2 w-1/2 text-ink-faint">
          <IconeUsuario />
        </span>
      ) : (
        <img
          src={urlAvatar(nick, tamanho * 2)}
          alt=""
          width={tamanho}
          height={tamanho}
          onError={() => setFalhou(true)}
          className="h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
      )}
    </span>
  );
}
