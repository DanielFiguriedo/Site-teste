import { useCallback, useEffect, useState } from "react";
import type { Plataforma } from "@shared/types";

const CHAVE = "loja:jogador";

export interface Jogador {
  nick: string;
  plataforma: Plataforma;
}

/** Nick do Java: 3 a 16 caracteres, apenas letras, números e underline. */
export const REGEX_NICK_JAVA = /^[A-Za-z0-9_]{3,16}$/;
/** Bedrock aceita espaços e é mais permissivo. */
export const REGEX_NICK_BEDROCK = /^[A-Za-z0-9_ .]{3,20}$/;

export function nickValido(nick: string, plataforma: Plataforma): boolean {
  const regex = plataforma === "bedrock" ? REGEX_NICK_BEDROCK : REGEX_NICK_JAVA;
  return regex.test(nick.trim());
}

/** Avatar 3D da cabeça do jogador. Serviço público, sem chave de API. */
export function urlAvatar(nick: string, tamanho = 64): string {
  return `https://mc-heads.net/avatar/${encodeURIComponent(nick)}/${tamanho}`;
}

function ler(): Jogador | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as Jogador;
    return dados?.nick ? dados : null;
  } catch {
    // Navegador anônimo ou storage bloqueado: seguir sem nick salvo.
    return null;
  }
}

/**
 * O nick é a identidade e o endereço de entrega do pedido. Guardá-lo entre
 * visitas evita que o jogador redigite (e erre) a cada compra.
 */
export function useJogador() {
  const [jogador, setEstado] = useState<Jogador | null>(() => ler());

  useEffect(() => {
    const aoMudar = () => setEstado(ler());
    window.addEventListener("storage", aoMudar);
    return () => window.removeEventListener("storage", aoMudar);
  }, []);

  const salvar = useCallback((novo: Jogador | null) => {
    try {
      if (novo) localStorage.setItem(CHAVE, JSON.stringify(novo));
      else localStorage.removeItem(CHAVE);
    } catch {
      // Sem persistência: o estado em memória ainda funciona nesta sessão.
    }
    setEstado(novo);
  }, []);

  return { jogador, salvar };
}
