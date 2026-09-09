import { createContext, useContext, type ReactNode } from "react";
import type { Category, StoreSettings } from "@shared/types";
import { useApi } from "./api";

interface StoreValue {
  settings: StoreSettings | undefined;
  categories: Category[];
  loading: boolean;
}

const Context = createContext<StoreValue>({
  settings: undefined,
  categories: [],
  loading: true,
});

/**
 * Settings and categories are fetched once and shared by the header and every
 * screen, instead of each one asking for them again.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const settings = useApi<StoreSettings>("/settings");
  const categories = useApi<Category[]>("/categories");

  return (
    <Context.Provider
      value={{
        settings: settings.data,
        categories: categories.data ?? [],
        loading: settings.loading || categories.loading,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export const useStore = () => useContext(Context);
