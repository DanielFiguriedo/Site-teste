import { useEffect, useState } from "react";
import type { ApiError } from "@shared/types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error ?? `Falha na requisição (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

/**
 * File upload. Separate from `api` because the body is `FormData`: setting
 * `content-type` by hand here would break the boundary the browser generates.
 */
export async function apiUpload<T>(path: string, data: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, { method: "POST", body: data });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error ?? `Falha no envio do arquivo (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export interface RequestState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
}

/**
 * Minimal fetch with cancellation. Deliberately small — the store has few
 * screens and none of them justifies pulling in a data-fetching library.
 */
export function useApi<T>(path: string | null): RequestState<T> {
  const [state, setState] = useState<RequestState<T>>({
    data: undefined,
    loading: path !== null,
    error: undefined,
  });

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;

    setState((previous) => ({ ...previous, loading: true, error: undefined }));
    api<T>(path)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: undefined });
      })
      .catch((e: Error) => {
        if (!cancelled) setState({ data: undefined, loading: false, error: e.message });
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
