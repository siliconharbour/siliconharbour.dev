import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";
import { useLogoUpload } from "./use-logo-upload";
import { useDrafts } from "./use-drafts";
import { FontStylesheet } from "./font-stylesheet";
import { googleFontFamilies, googleFontsUrl } from "./fonts";
import { themeVariables, type Theme } from "./tokens";
import type { SharedTheme } from "./share-config";

interface ThemeContextValue extends ReturnType<typeof useLogoUpload> {
  drafts: ReturnType<typeof useDrafts>;
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
export function ThemeProvider({ shared, children }: { shared?: SharedTheme; children: ReactNode }) {
  const drafts = useDrafts(shared);
  const { theme, logo } = drafts.draft;
  const logoUpload = useLogoUpload(logo, (value) => drafts.change({ logo: value }));
  const location = useLocation();
  const [advanced, setAdvanced] = useState(false);
  const [open, setOpen] = useState(!!shared);
  const lastShare = useRef(shared ? `${shared.id}:${shared.revision}` : undefined);
  const [fontFailure, setFontFailure] = useState<{ url: string; message: string }>();
  const fontUrl = googleFontsUrl(theme.bodyFont, theme.headingFont);
  const fontError = fontFailure?.url === fontUrl ? fontFailure.message : undefined;
  useLayoutEffect(() => {
    const key = shared ? `${shared.id}:${shared.revision}` : undefined;
    if (drafts.ready && shared && key !== lastShare.current) {
      logoUpload.cancelLogoUpload();
      drafts.applyShared(shared);
      setOpen(true);
    }
    lastShare.current = key;
  }, [shared?.id, shared?.revision, drafts.ready]);
  useLayoutEffect(() => {
    for (const [name, value] of Object.entries(themeVariables(theme)))
      document.documentElement.style.setProperty(name, value);
  }, [theme, location.pathname]);
  return (
    <ThemeContext.Provider
      value={{
        ...logoUpload,
        drafts,
        theme,
        setTheme: (value) => drafts.change({ theme: value }),
        advanced,
        setAdvanced,
        open,
        setOpen,
        error: drafts.storageError || undefined,
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
