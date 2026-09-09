import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export interface Admin {
  id: number;
  email: string;
}

/**
 * Sessão do painel.
 *
 * A sessão real é um cookie `HttpOnly` — o JavaScript não a lê nem poderia.
 * Este hook só pergunta ao servidor "ainda estou logado?" para decidir entre
 * mostrar o painel ou a tela de login.
 */
export function useAdmin() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [verificando, setVerificando] = useState(true);

  const verificar = useCallback(async () => {
    try {
      setAdmin(await api<Admin>("/admin/eu"));
    } catch {
      setAdmin(null);
    } finally {
      setVerificando(false);
    }
  }, []);

  useEffect(() => {
    void verificar();
  }, [verificar]);

  const sair = useCallback(async () => {
    await api("/admin/logout", { method: "POST" }).catch(() => undefined);
    setAdmin(null);
  }, []);

  return { admin, verificando, verificar, sair };
}
