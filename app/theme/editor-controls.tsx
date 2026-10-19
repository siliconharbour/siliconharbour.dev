import { EditorSection } from "./editor-section";
import type { Theme } from "./tokens";
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
const groups = [
  {
    title: "Spacing and corners",
    basic: ["padding", "panelRadius"],
    extra: ["gaps", "controlRadius"],
  },
  { title: "Borders", basic: ["borderContrast"], extra: ["borderWidth", "cardOutlineOpacity"] },
  {
    title: "Shadows",
    basic: ["shadowOpacity"],
    extra: ["shadowBlur", "shadowOffset", "shadowSpread"],
  },
] as const;
const controls: readonly Control[] = [...layoutControls, ...appearanceControls];

export function EditorControls() {
  const { theme, setTheme } = useTheme();
  const rootPixels = useRootFontSize();
  function reset(keys: readonly (keyof Theme)[]) {
    setTheme({ ...theme, ...Object.fromEntries(keys.map((key) => [key, DEFAULT_THEME[key]])) });
  }
  function sliders(keys: readonly string[]) {
    return controls
      .filter((control) => keys.includes(control.key))
      .map((control) => <Slider key={control.key} control={control} rootPixels={rootPixels} />);
  }
  return (
    <div className="theme-controls">
      <ColorControls />
      <EditorSection
        title="Typography"
        onReset={() =>
          reset(["bodyFont", "headingFont", "typeScale", "lineHeight", "letterSpacing"])
        }
      >
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
        <p className="theme-help">Presets or any Google Fonts family.</p>
        {sliders(["typeScale"])}
        <details className="theme-advanced">
          <summary>Advanced</summary>
          {sliders(["lineHeight", "letterSpacing"])}
        </details>
      </EditorSection>
      {groups.map((group) => (
        <EditorSection
          key={group.title}
          title={group.title}
          onReset={() => reset([...group.basic, ...group.extra])}
        >
          {sliders(group.basic)}
          <details className="theme-advanced">
            <summary>Advanced</summary>
            {sliders(group.extra)}
            {group.title === "Spacing and corners" && <SpacingScale rootPixels={rootPixels} />}
          </details>
        </EditorSection>
      ))}
      <EditorSection
        title="Effects"
        defaultOpen={false}
        onReset={() => reset(["hoverLift", "imageTint"])}
      >
        {sliders(["hoverLift", "imageTint"])}
      </EditorSection>
      <LogoControl />
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
