import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  accent: string;
  setAccent: (hex: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "gf-theme";
const ACCENT_KEY = "gf-accent";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function applyAccent(hex: string) {
  if (typeof document === "undefined" || !hex) return;
  document.documentElement.style.setProperty("--primary", hex);
  document.documentElement.style.setProperty("--ring", hex);
  document.documentElement.style.setProperty("--sidebar-primary", hex);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accent, setAccentState] = useState<string>("");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "dark";
    setThemeState(stored);
    applyTheme(stored);
    const storedAccent = localStorage.getItem(ACCENT_KEY) ?? "";
    if (storedAccent) {
      setAccentState(storedAccent);
      applyAccent(storedAccent);
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    applyTheme(t);
  };

  const setAccent = (hex: string) => {
    setAccentState(hex);
    localStorage.setItem(ACCENT_KEY, hex);
    applyAccent(hex);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"), accent, setAccent }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}