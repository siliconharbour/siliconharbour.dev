import { DraftControls, ShareControls } from "./share-controls";
import { EditorControls } from "./editor-controls";
import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { Link, useMatch } from "react-router";
import { useTheme } from "./provider";
import { DEFAULT_THEME, themeVariables } from "./tokens";
import "./editor.css";

const editorTheme = themeVariables(DEFAULT_THEME) as CSSProperties;
export function ThemeEditor({ docked = false }: { docked?: boolean }) {
  const onDesign = !!useMatch("/design/*");
  const { setTheme, open, setOpen, error, fontError, setLogo } = useTheme();
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ x: 12, y: 72 });
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
  function close() {
    setOpen(false);
    launcher.current?.focus();
  }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button") || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
  }
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
                  </div>
                </div>
                <button type="button" onClick={close} aria-label="Close design studio">
                  ×
                </button>
              </>
            )}
          </div>
          <div className="theme-toolbar">
            <button
              className="theme-reset"
              type="button"
              onClick={() => {
                setTheme({ ...DEFAULT_THEME });
                setLogo(null);
              }}
            >
              Reset theme
            </button>
          </div>
          <div className="theme-panel-body">
            {error && (
              <p className="theme-notice" role="alert">
                {error}
              </p>
            )}
            {fontError && (
              <p className="theme-notice" role="status">
                {fontError}
              </p>
            )}
            <EditorControls />
            <DraftControls />
          </div>
          <div className="theme-panel-footer">
            {!docked && (
              <Link to="/design" className="theme-link">
                Examples ↗
              </Link>
            )}
            <ShareControls />
          </div>
        </aside>
      )}
    </div>
  );
}
