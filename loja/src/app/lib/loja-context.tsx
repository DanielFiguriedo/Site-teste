import { createContext, useContext, type ReactNode } from "react";
import type { Categoria, ConfigLoja } from "@shared/types";
import { useApi } from "./api";

interface ValorLoja {
  config: ConfigLoja | undefined;
  categorias: Categoria[];
  carregando: boolean;
}

const Contexto = createContext<ValorLoja>({
  config: undefined,
  categorias: [],
  carregando: true,
});

/** Config e categorias são pedidas uma vez e usadas pelo header e por todas as telas. */
export function ProvedorLoja({ children }: { children: ReactNode }) {
  const config = useApi<ConfigLoja>("/config");
  const categorias = useApi<Categoria[]>("/categorias");

  return (
    <Contexto.Provider
      value={{
        config: config.dados,
        categorias: categorias.dados ?? [],
        carregando: config.carregando || categorias.carregando,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export const useLoja = () => useContext(Contexto);
