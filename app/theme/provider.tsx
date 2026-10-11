import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigationType } from "react-router";
import { decodeTheme, themeVariables, type Theme } from "./tokens";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  error?: string;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const [theme, setTheme] = useState(initialTheme);
  const [open, setOpen] = useState(new URLSearchParams(location.search).get("studio") === "1");
  const raw = new URLSearchParams(location.search).get("theme");
  const [error, setError] = useState(decodeTheme(raw).error);
  const lastRaw = useRef(raw);
  useLayoutEffect(() => {
    if (raw !== lastRaw.current || navigationType === "POP") {
      const parsed = decodeTheme(raw);
      if (parsed.theme) setTheme(parsed.theme);
      setError(parsed.error);
      lastRaw.current = raw;
    }
  }, [raw, location.key, navigationType]);
  useLayoutEffect(() => {
    const variables = themeVariables(theme);
    for (const [name, value] of Object.entries(variables))
      document.documentElement.style.setProperty(name, value);
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, setTheme, open, setOpen, error }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme controls require ThemeProvider");
  return context;
}
