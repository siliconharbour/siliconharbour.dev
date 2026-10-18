import { LogoControl } from "./logo-control";
import { DEFAULT_THEME, themeVariables } from "./tokens";
import { controlValues, formatRem } from "./control-values";
import { useRootFontSize } from "./use-root-font-size";
import { appearanceControls } from "./appearance";
import { ColorControls } from "./color-controls";
import { FontField } from "./font-field";
import { useTheme } from "./provider";

const layoutControls = [
  { key: "typeScale", label: "Type size", min: 0.8, max: 1.5, step: 0.05, unit: "×" },
  { key: "lineHeight", label: "Line height", min: 1, max: 1.4, step: 0.05, unit: "×" },
  { key: "padding", label: "Padding", min: 0.5, max: 2, step: 0.05, unit: "×" },
  { key: "gaps", label: "Gaps", min: 0.5, max: 2, step: 0.05, unit: "×" },
  { key: "controlRadius", label: "Input and button corners", min: 0, max: 24, step: 1, unit: "px" },
  { key: "panelRadius", label: "Card corners", min: 0, max: 32, step: 1, unit: "px" },
] as const;
type Control = (typeof layoutControls)[number] | (typeof appearanceControls)[number];
const simpleKeys = new Set([
  "typeScale",
  "padding",
  "panelRadius",
  "borderContrast",
  "shadowOpacity",
]);
const advancedGroups = [
  {
    title: "Spacing and corners",
    keys: ["padding", "gaps", "controlRadius", "panelRadius"],
    note: "Padding and gaps scale every spacing token. Spacing 4 is the 1rem reference; gaps also change recurring card layers.",
  },
  {
    title: "Borders",
    keys: ["borderContrast", "borderWidth", "cardOutlineOpacity"],
    note: "Contrast moves borders toward the body text colour.",
  },
  {
    title: "Shadows",
    keys: ["shadowOpacity", "shadowBlur", "shadowOffset", "shadowSpread"],
    note: "Raise opacity to add a shadow. Its colour follows the headings.",
  },
  {
    title: "Finishing touches",
    keys: ["hoverLift", "imageTint", "letterSpacing"],
    note: "Hover lift is off when someone prefers reduced motion.",
  },
];
const controls: readonly Control[] = [...layoutControls, ...appearanceControls];

export function EditorControls() {
  const { theme, setTheme, advanced } = useTheme();
  const rootPixels = useRootFontSize();
  const fonts = (
    <>
      <p className="theme-help">Choose a font or enter a Google Fonts name, then Apply.</p>
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
    </>
  );
  return (
    <div className="theme-controls">
      <ColorControls advanced={advanced} />
      <LogoControl />
      {advanced ? (
        <>
          <details className="theme-details">
            <summary>Fonts and type</summary>
            {fonts}
            {layoutControls.slice(0, 2).map((control) => (
              <Slider key={control.key} control={control} rootPixels={rootPixels} />
            ))}
          </details>
          {advancedGroups.map((group) => (
            <details key={group.title} className="theme-details">
              <summary>{group.title}</summary>
              <p className="theme-help">{group.note}</p>
              {controls
                .filter((control) => group.keys.includes(control.key))
                .map((control) => (
                  <Slider key={control.key} control={control} rootPixels={rootPixels} />
                ))}
              {group.title === "Spacing and corners" && <SpacingScale rootPixels={rootPixels} />}
            </details>
          ))}
        </>
      ) : (
        <>
          <section className="theme-control-section" aria-label="Fonts">
            <h3>Fonts</h3>
            {fonts}
          </section>
          <section className="theme-control-section" aria-label="Appearance">
            <h3>Appearance</h3>
            {controls
              .filter((control) => simpleKeys.has(control.key))
              .map((control) => (
                <Slider key={control.key} control={control} rootPixels={rootPixels} />
              ))}
          </section>
        </>
      )}
    </div>
  );
}
function Slider({ control, rootPixels }: { control: Control; rootPixels: number | null }) {
  const { theme, setTheme } = useTheme();
  const values = controlValues(control.key, control.unit, theme, rootPixels);
  return (
    <label className="theme-slider">
      <span>
        {control.label}
        <output>{control.unit === "×" ? `${theme[control.key]}×` : values.current}</output>
      </span>
      <small className="theme-value-reference">
        {values.label && (
          <>
            {values.label}: {values.current}.{" "}
          </>
        )}
        Default: {values.baseline}
      </small>
      <input
        aria-label={control.label}
        aria-valuetext={`${control.unit === "×" ? `${theme[control.key]} times, ` : ""}${values.current}; default ${values.baseline}`}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={theme[control.key]}
        onChange={(event) => setTheme({ ...theme, [control.key]: Number(event.target.value) })}
      />
    </label>
  );
}

function SpacingScale({ rootPixels }: { rootPixels: number | null }) {
  const { theme } = useTheme();
  const current = themeVariables(theme);
  const baseline = themeVariables(DEFAULT_THEME);
  return (
    <details className="theme-details">
      <summary>Spacing values</summary>
      <div className="theme-spacing-table">
        <table aria-label="Default and current spacing values">
          <thead>
            <tr>
              <th>Step</th>
              <th>Default</th>
              <th>Padding</th>
              <th>Gaps</th>
            </tr>
          </thead>
          <tbody>
            {[2, 4, 6, 8].map((step) => (
              <tr key={step}>
                <th scope="row">{step}</th>
                <td>{formatRem(baseline[`--theme-pad-${step}`], rootPixels)}</td>
                <td>{formatRem(current[`--theme-pad-${step}`], rootPixels)}</td>
                <td>{formatRem(current[`--theme-gap-${step}`], rootPixels)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
