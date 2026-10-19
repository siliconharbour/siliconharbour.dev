import { useState } from "react";
import { DEFAULT_THEME } from "./tokens";
import { EditorSection } from "./editor-section";
import { ColorPicker } from "./color-picker";
import {
  COLOR_ROLES,
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
    <EditorSection
      title="Colours"
      onReset={() =>
        setTheme({
          ...theme,
          brand: DEFAULT_THEME.brand,
          ramp: DEFAULT_THEME.ramp,
          ...Object.fromEntries(COLOR_ROLES.map((role) => [role.key, null])),
        })
      }
    >
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
      <details className="theme-advanced">
        <summary>Advanced</summary>
        <EditorSection
          title="Palette shades"
          defaultOpen={false}
          onReset={() =>
            setTheme({ ...theme, brand: DEFAULT_THEME.brand, ramp: DEFAULT_THEME.ramp })
          }
        >
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
        </EditorSection>
        <EditorSection
          title="Individual colours"
          defaultOpen={false}
          onReset={() =>
            setTheme({
              ...theme,
              ...Object.fromEntries(COLOR_ROLES.map((role) => [role.key, null])),
            })
          }
        >
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
        </EditorSection>
      </details>
    </EditorSection>
  );
}
