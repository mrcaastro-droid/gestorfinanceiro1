import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { formatCurrency } from "@/lib/format";

const KEY = "app.hide-values";

type Ctx = { hidden: boolean; toggle: () => void };
const HideValuesContext = createContext<Ctx>({ hidden: false, toggle: () => {} });

export function HideValuesProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(window.localStorage.getItem(KEY) === "true");
  }, []);

  const toggle = () =>
    setHidden((v) => {
      const next = !v;
      window.localStorage.setItem(KEY, String(next));
      return next;
    });

  return <HideValuesContext.Provider value={{ hidden, toggle }}>{children}</HideValuesContext.Provider>;
}

export function useHideValues() {
  return useContext(HideValuesContext);
}

/** Formata um valor em BRL, mascarando quando os valores estão ocultos. */
export function maskCurrency(value: number, hidden: boolean) {
  if (!hidden) return formatCurrency(value);
  return "R$ ••••";
}

/** Componente de moeda que respeita o modo "ocultar valores". */
export function Currency({ value, className }: { value: number; className?: string }) {
  const { hidden } = useHideValues();
  return <span className={className}>{maskCurrency(value, hidden)}</span>;
}
