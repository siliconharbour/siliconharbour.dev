import { useState } from "react";
import { ColorPicker } from "./color-picker";
import {
  COLOR_ROLES,
  DEFAULT_RAMP,
  SHADES,
  colorCss,
  rampStep,
  resolveColors,
  resolvePalette,
  type Shade,
  type Oklch,
} from "./colors";
import { useTheme } from "./provider";

export function ColorControls({ advanced }: { advanced: boolean }) {
  const { theme, setTheme } = useTheme();
  const [shade, setShade] = useState<Shade>("700");
  const palette = resolvePalette(theme);
  const colors = resolveColors(theme);
  function changeStop(color: Oklch) {
    setTheme(
      shade === "600"
        ? { ...theme, brand: color }
        : {
            ...theme,
            ramp: { ...theme.ramp, [shade]: rampStep(theme.brand, color) },
          },
    );
  }
  return (
    <section aria-label="Theme colours">
      <ColorPicker
        label="Main colour"
        value={theme.brand}
        onChange={(brand) => setTheme({ ...theme, brand })}
      />
      <div className="theme-palette" aria-label="Palette preview">
        {SHADES.map((stop) => (
          <div key={stop}>
            <span style={{ background: colorCss(palette[stop]) }} />
            <small>{stop}</small>
          </div>
        ))}
      </div>
      {advanced && (
        <>
          <details className="theme-details">
            <summary>Palette shades</summary>
            <p className="theme-help">Shades follow the main colour (600).</p>
            <div className="theme-ramp" aria-label="Ramp stops">
              {SHADES.map((stop) => (
                <button
                  key={stop}
                  type="button"
                  aria-label={`Edit ramp ${stop}`}
                  aria-pressed={shade === stop}
                  onClick={() => setShade(stop)}
                >
                  <span style={{ background: colorCss(palette[stop]) }} />
                  {stop}
                </button>
              ))}
            </div>
            <ColorPicker label={`Ramp ${shade}`} value={palette[shade]} onChange={changeStop} />
            <button
              className="theme-small-button"
              type="button"
              onClick={() => setTheme({ ...theme, ramp: DEFAULT_RAMP })}
            >
              Reset ramp
            </button>
          </details>
          <details className="theme-details">
            <summary>Individual colours</summary>
            <p className="theme-help">Override a role, or leave it linked to the palette.</p>
            {COLOR_ROLES.map((role) => (
              <div key={role.key} className="theme-role">
                <label>
                  <input
                    type="checkbox"
                    checked={theme[role.key] !== null}
                    aria-label={`Override ${role.label}`}
                    onChange={(event) =>
                      setTheme({
                        ...theme,
                        [role.key]: event.target.checked ? colors[role.key] : null,
                      })
                    }
                  />
                  {role.label}{" "}
                  <small>{theme[role.key] === null ? `follows ${role.source}` : "custom"}</small>
                </label>
                {theme[role.key] !== null && (
                  <ColorPicker
                    label={role.label}
                    value={colors[role.key]}
                    onChange={(color) => setTheme({ ...theme, [role.key]: color })}
                  />
                )}
              </div>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
