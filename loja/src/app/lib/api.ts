import { useEffect, useState } from "react";
import type { ApiErro } from "@shared/types";

export async function api<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`/api${caminho}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as ApiErro | null;
    throw new Error(corpo?.erro ?? `Falha na requisição (${resposta.status}).`);
  }
  return resposta.json() as Promise<T>;
}

/**
 * Envio de arquivo. Separado de `api` porque o corpo é `FormData`: definir
 * `content-type` na mão aqui quebraria o boundary que o navegador gera.
 */
export async function apiUpload<T>(caminho: string, dados: FormData): Promise<T> {
  const resposta = await fetch(`/api${caminho}`, { method: "POST", body: dados });

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as ApiErro | null;
    throw new Error(corpo?.erro ?? `Falha no envio do arquivo (${resposta.status}).`);
  }
  return resposta.json() as Promise<T>;
}

export interface EstadoRequisicao<T> {
  dados: T | undefined;
  carregando: boolean;
  erro: string | undefined;
}

/**
 * Busca simples com cancelamento. Deliberadamente mínimo — a loja tem poucas
 * telas e nenhuma delas justifica trazer uma biblioteca de data fetching.
 */
export function useApi<T>(caminho: string | null): EstadoRequisicao<T> {
  const [estado, setEstado] = useState<EstadoRequisicao<T>>({
    dados: undefined,
    carregando: caminho !== null,
    erro: undefined,
  });

  useEffect(() => {
    if (caminho === null) return;
    let cancelado = false;

    setEstado((a) => ({ ...a, carregando: true, erro: undefined }));
    api<T>(caminho)
      .then((dados) => {
        if (!cancelado) setEstado({ dados, carregando: false, erro: undefined });
      })
      .catch((e: Error) => {
        if (!cancelado) setEstado({ dados: undefined, carregando: false, erro: e.message });
      });

    return () => {
      cancelado = true;
    };
  }, [caminho]);

  return estado;
}
