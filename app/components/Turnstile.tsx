import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: TurnstileOptions
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
  className?: string;
}

// Track if script is loading/loaded
let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  scriptLoadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    script.async = true;
    script.defer = true;
    
    window.onTurnstileLoad = () => {
      resolve();
    };

    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export function Turnstile({
  siteKey,
  onVerify,
  onExpire,
  onError,
  theme = "auto",
  size = "normal",
  className = "",
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const handleVerify = useCallback((token: string) => {
    onVerify(token);
  }, [onVerify]);

  useEffect(() => {
    let mounted = true;

    const initWidget = async () => {
      await loadTurnstileScript();

      if (!mounted || !containerRef.current || !window.turnstile) {
        return;
      }

      // Remove any existing widget
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // Widget may already be removed
        }
      }

      // Render new widget
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: handleVerify,
        "expired-callback": onExpire,
        "error-callback": onError,
        theme,
        size,
      });
    };

    initWidget();

    return () => {
      mounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [siteKey, handleVerify, onExpire, onError, theme, size]);

  return <div ref={containerRef} className={className} />;
}

/**
 * A version of Turnstile that works with a hidden input for form submission
 */
interface TurnstileInputProps {
  siteKey: string;
  name?: string;
  theme?: "light" | "dark" | "auto";
  className?: string;
}

export function TurnstileInput({
  siteKey,
  name = "cf-turnstile-response",
  theme = "auto",
  className = "",
}: TurnstileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleVerify = useCallback((token: string) => {
    if (inputRef.current) {
      inputRef.current.value = token;
    }
  }, []);

  const handleExpireOrError = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  return (
    <div className={className}>
      <input type="hidden" name={name} ref={inputRef} />
      <Turnstile
        siteKey={siteKey}
        onVerify={handleVerify}
        onExpire={handleExpireOrError}
        onError={handleExpireOrError}
        theme={theme}
      />
    </div>
  );
}
