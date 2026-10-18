import { useLogoUpload } from "./use-logo-upload";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigationType } from "react-router";
import { FontStylesheet } from "./font-stylesheet";
import { googleFontFamilies, googleFontsUrl } from "./fonts";
import { decodeTheme, themeVariables, type Theme } from "./tokens";

interface ThemeContextValue extends ReturnType<typeof useLogoUpload> {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  advanced: boolean;
  setAdvanced: (advanced: boolean) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  error?: string;
  fontError?: string;
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
  const logoUpload = useLogoUpload();
  const [advanced, setAdvanced] = useState(false);
  const [open, setOpen] = useState(new URLSearchParams(location.search).get("studio") === "1");
  const [fontFailure, setFontFailure] = useState<{ url: string; message: string }>();
  const fontUrl = googleFontsUrl(theme.bodyFont, theme.headingFont);
  const fontError = fontFailure?.url === fontUrl ? fontFailure.message : undefined;
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
    <ThemeContext.Provider
      value={{
        ...logoUpload,
        theme,
        setTheme,
        advanced,
        setAdvanced,
        open,
        setOpen,
        error,
        fontError,
      }}
    >
      {fontUrl && (
        <FontStylesheet
          key={fontUrl}
          url={fontUrl}
          families={googleFontFamilies(theme.bodyFont, theme.headingFont)}
          onStatus={(message) => setFontFailure(message ? { url: fontUrl, message } : undefined)}
        />
      )}
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme controls require ThemeProvider");
  return context;
}
