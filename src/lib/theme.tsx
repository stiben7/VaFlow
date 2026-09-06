"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ThemeChoice = "system" | "light" | "dark";

type ThemeCtx = {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  resolved: "light" | "dark";
};

const ThemeContext = createContext<ThemeCtx>({
  theme: "system",
  setTheme: () => {},
  resolved: "light",
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "vaflow.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Read stored preference on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeChoice | null;
      if (stored && ["system", "light", "dark"].includes(stored)) {
        setThemeState(stored);
      }
    } catch {
      // Private mode or storage error -- stay on system default.
    }
  }, []);

  // Apply data-theme attribute and resolve the effective palette.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }

    const resolve = (): "light" | "dark" => {
      if (theme === "light") return "light";
      if (theme === "dark") return "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    };
    setResolved(resolve());

    // When following the system, update on OS-level changes.
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => setResolved(resolve());
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // Best-effort persistence.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}
