import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export interface Admin {
  id: number;
  email: string;
}

/**
 * Admin panel session.
 *
 * The real session is an `HttpOnly` cookie — JavaScript neither reads it nor
 * could. This hook only asks the server "am I still signed in?" so the app can
 * decide between the panel and the login screen.
 */
export function useAdmin() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    try {
      setAdmin(await api<Admin>("/admin/me"));
    } catch {
      setAdmin(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const signOut = useCallback(async () => {
    await api("/admin/logout", { method: "POST" }).catch(() => undefined);
    setAdmin(null);
  }, []);

  return { admin, checking, check, signOut };
}
