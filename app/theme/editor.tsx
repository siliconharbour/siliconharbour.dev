import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { Link, useLocation, useMatch } from "react-router";
import { useTheme } from "./provider";
import { DEFAULT_THEME, themeUrl, themeVariables, type Theme } from "./tokens";
import "./editor.css";
import { ColorControls } from "./color-controls";
import { FontField } from "./font-field";

const sliders = [
  { key: "typeScale", label: "Type size", min: 0.8, max: 1.5, step: 0.05, unit: "×" },
  { key: "lineHeight", label: "Line height", min: 1, max: 1.4, step: 0.05, unit: "×" },
  { key: "padding", label: "Padding density", min: 0.5, max: 2, step: 0.05, unit: "×" },
  { key: "gaps", label: "Space between items", min: 0.5, max: 2, step: 0.05, unit: "×" },
  { key: "controlRadius", label: "Control corners", min: 0, max: 24, step: 1, unit: "px" },
  { key: "panelRadius", label: "Card corners", min: 0, max: 32, step: 1, unit: "px" },
] as const;
const editorTheme = themeVariables(DEFAULT_THEME) as CSSProperties;
export function ThemeEditor({ docked = false }: { docked?: boolean }) {
  const onDesign = !!useMatch("/design");
  const { theme, setTheme, open, setOpen, error, fontError } = useTheme();
  const location = useLocation();
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ x: 12, y: 72 });
  const [shareLink, setShareLink] = useState("");
  const [status, setStatus] = useState("");
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  function move(x: number, y: number) {
    const rect = panel.current?.getBoundingClientRect();
    setPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - (rect?.width ?? 360) - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - (rect?.height ?? 600) - 8)),
    });
  }
  useEffect(() => {
    if (!open || docked || onDesign) return;
    const handle = () => move(position.x, position.y);
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [open, docked, onDesign, position.x, position.y]);
  useEffect(() => {
    if (docked) setOpen(true);
  }, [docked, setOpen]);
  useEffect(() => {
    setShareLink("");
    setStatus("");
  }, [theme, location.pathname, location.search]);
  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button") || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
  }
  async function share() {
    const link = themeUrl(new URL(window.location.href), theme);
    setShareLink(link);
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Link copied. It includes this page’s filters and your theme.");
    } catch {
      setStatus("Copy the link below to share this theme.");
    }
  }
  const designParams = new URL(themeUrl(new URL("https://example.invalid/design"), theme)).search;
  if (onDesign && !docked) return null;
  return (
    <div className={`theme-editor${docked ? " theme-editor--docked" : ""}`} style={editorTheme}>
      {!docked && (
        <button
          ref={launcher}
          type="button"
          className="theme-launcher"
          aria-label="Open design studio"
          aria-expanded={open}
          aria-controls="theme-studio"
          onClick={() => setOpen(!open)}
          title="Design studio"
        >
          🎨
        </button>
      )}
      {(docked || open) && (
        <aside
          ref={panel}
          id="theme-studio"
          className="theme-panel"
          aria-label="Design studio"
          style={docked ? undefined : { left: position.x, top: position.y }}
          onKeyDown={(event) => {
            if (!docked && event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="theme-panel-header">
            {docked ? (
              <div>
                <strong>Design studio</strong>
                <span>Live controls · preview on the right</span>
              </div>
            ) : (
              <>
                <div
                  className="theme-panel-handle"
                  tabIndex={0}
                  role="button"
                  aria-label="Move design studio. Use arrow keys to move."
                  onPointerDown={startDrag}
                  onPointerMove={(event) => {
                    if (drag.current)
                      move(
                        drag.current.x + event.clientX - drag.current.startX,
                        drag.current.y + event.clientY - drag.current.startY,
                      );
                  }}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 40 : 10;
                    const directions: Record<string, [number, number]> = {
                      ArrowLeft: [-step, 0],
                      ArrowRight: [step, 0],
                      ArrowUp: [0, -step],
                      ArrowDown: [0, step],
                    };
                    if (directions[event.key]) {
                      event.preventDefault();
                      move(
                        position.x + directions[event.key][0],
                        position.y + directions[event.key][1],
                      );
                    }
                  }}
                >
                  <div>
                    <strong>Design studio</strong>
                    <span>Drag to move · preview only</span>
                  </div>
                </div>
                <button type="button" onClick={close} aria-label="Close design studio">
                  ×
                </button>
              </>
            )}
          </div>
          <div className="theme-panel-body">
            {error && <p className="theme-notice">{error}</p>}
            <div className="theme-actions">
              <Link to={`/design${designParams}`} className="theme-link">
                Open /design ↗
              </Link>
              <button type="button" onClick={() => setTheme({ ...DEFAULT_THEME })}>
                Reset theme
              </button>
            </div>
            <ColorControls />
            <fieldset>
              <legend>Typography</legend>
              <p>Choose a preset or enter any Google Fonts family name, then Apply.</p>
              <FontField
                label="Body font"
                value={theme.bodyFont}
                onChange={(bodyFont) => setTheme({ ...theme, bodyFont })}
              />
              <FontField
                label="Heading font"
                value={theme.headingFont}
                onChange={(headingFont) => setTheme({ ...theme, headingFont })}
              />
              {fontError && (
                <p className="theme-notice" role="status">
                  {fontError}
                </p>
              )}
              {sliders.slice(0, 2).map((slider) => (
                <Slider key={slider.key} slider={slider} theme={theme} onChange={setTheme} />
              ))}
            </fieldset>
            <fieldset>
              <legend>Spacing & corners</legend>
              <p>Space between items also adjusts recurring card stacks.</p>
              {sliders.slice(2).map((slider) => (
                <Slider key={slider.key} slider={slider} theme={theme} onChange={setTheme} />
              ))}
            </fieldset>
            <fieldset>
              <legend>Brand graphic</legend>
              <p>
                Logo uploads are coming later. Shared graphics need a permanent hosted asset; theme
                links currently include styles only.
              </p>
            </fieldset>
            <button type="button" className="theme-share" onClick={share}>
              Copy share link
            </button>
            <p className="theme-status" role="status">
              {status ||
                "Changes stay in this tab as you browse. Share a link to restore them on another device."}
            </p>
            {shareLink && (
              <label className="theme-field">
                Share link
                <textarea
                  aria-label="Share link"
                  readOnly
                  value={shareLink}
                  onFocus={(e) => e.currentTarget.select()}
                  rows={3}
                />
              </label>
            )}
            <p className="theme-note">
              Status colours stay fixed. Logos, favicons and social images retain the published
              branding. Closing the studio keeps your preview; Reset restores the site’s defaults.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
function Slider({
  slider,
  theme,
  onChange,
}: {
  slider: (typeof sliders)[number];
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <label className="theme-slider">
      <span>
        {slider.label}
        <output>
          {Number(theme[slider.key].toFixed(2))}
          {slider.unit}
        </output>
      </span>
      <input
        aria-label={slider.label}
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={theme[slider.key]}
        onChange={(e) => onChange({ ...theme, [slider.key]: Number(e.target.value) })}
      />
    </label>
  );
}
