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
    note: "Gaps also change the spacing between recurring card layers.",
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
      {advanced ? (
        <>
          <details className="theme-details">
            <summary>Fonts and type</summary>
            {fonts}
            {layoutControls.slice(0, 2).map((control) => (
              <Slider key={control.key} control={control} />
            ))}
          </details>
          {advancedGroups.map((group) => (
            <details key={group.title} className="theme-details">
              <summary>{group.title}</summary>
              <p className="theme-help">{group.note}</p>
              {controls
                .filter((control) => group.keys.includes(control.key))
                .map((control) => (
                  <Slider key={control.key} control={control} />
                ))}
            </details>
          ))}
          <details className="theme-details">
            <summary>Logo uploads</summary>
            <p className="theme-help">
              Logo uploads need permanent hosting. For now, share links include style settings only.
              Logos, favicons and social images keep the published branding.
            </p>
          </details>
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
                <Slider key={control.key} control={control} />
              ))}
          </section>
        </>
      )}
    </div>
  );
}
function Slider({ control }: { control: Control }) {
  const { theme, setTheme } = useTheme();
  return (
    <label className="theme-slider">
      <span>
        {control.label}
        <output>
          {Number(theme[control.key].toFixed(3))}
          {control.unit}
        </output>
      </span>
      <input
        aria-label={control.label}
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
