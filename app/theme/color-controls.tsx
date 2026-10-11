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

export function ColorControls() {
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
      <p>
        Change the main colour to update the whole harbour ramp, text, headings, borders and
        actions. White surfaces and status colours stay neutral.
      </p>
      <ColorPicker
        label="Main colour"
        value={theme.brand}
        onChange={(brand) => setTheme({ ...theme, brand })}
      />
      <details className="theme-details">
        <summary>Edit colour ramp</summary>
        <p>
          Choose a stop to edit. Stops keep their lightness, chroma and hue offsets from the main
          colour as it changes. 600 is the main colour.
        </p>
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
        <summary>Override individual roles</summary>
        <p>
          Roles follow the ramp until you override them. Clear an override to follow the ramp again.
        </p>
        {COLOR_ROLES.map((role) => (
          <div key={role.key} className="theme-role">
            <label>
              <input
                type="checkbox"
                checked={theme[role.key] !== null}
                aria-label={`Override ${role.label}`}
                onChange={(event) =>
                  setTheme({ ...theme, [role.key]: event.target.checked ? colors[role.key] : null })
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
    </section>
  );
}
