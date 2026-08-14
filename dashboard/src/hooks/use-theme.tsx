import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Tema = "dark" | "light";

interface ThemeContextValue {
  tema: Tema;
  toggle: () => void;
  setTema: (t: Tema) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "klaus-theme";

function temaInicial(): Tema {
  if (typeof window === "undefined") return "dark";
  const salvo = window.localStorage.getItem(STORAGE_KEY) as Tema | null;
  if (salvo === "light" || salvo === "dark") return salvo;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>("dark");
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    setTemaState(temaInicial());
    setHidratado(true);
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(tema);
    root.style.colorScheme = tema;
    window.localStorage.setItem(STORAGE_KEY, tema);
  }, [tema, hidratado]);

  function setTema(t: Tema) {
    setTemaState(t);
  }

  function toggle() {
    setTemaState((atual) => (atual === "dark" ? "light" : "dark"));
  }

  return (
    <ThemeContext.Provider value={{ tema, toggle, setTema }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de ThemeProvider");
  return ctx;
}
