import { useId } from "react";
import { inGamut } from "culori";
import { colorCss, type Oklch } from "./colors";

const channels = [
  { key: "l", label: "Lightness", min: 0, max: 1, step: 0.001, precision: 4 },
  { key: "c", label: "Chroma", min: 0, max: 0.4, step: 0.001, precision: 4 },
  { key: "h", label: "Hue", min: 0, max: 360, step: 1, precision: 2 },
] as const;
const inSrgb = inGamut("rgb");
export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Oklch;
  onChange: (color: Oklch) => void;
}) {
  const id = useId();
  return (
    <fieldset className="theme-oklch">
      <legend>{label}</legend>
      <div className="theme-color-preview" style={{ background: colorCss(value) }} />
      <code>{colorCss(value)}</code>
      {channels.map((channel) => {
        const gradient = Array.from({ length: 13 }, (_, index) =>
          colorCss({
            ...value,
            [channel.key]: (channel.max * index) / 12,
          }),
        ).join(", ");
        const update = (next: number) => {
          if (Number.isFinite(next))
            onChange({
              ...value,
              [channel.key]: Math.max(channel.min, Math.min(channel.max, next)),
            });
        };
        return (
          <div className="theme-channel" key={channel.key}>
            <label htmlFor={`${id}-${channel.key}`}>{channel.label}</label>
            <input
              id={`${id}-${channel.key}`}
              aria-label={`${label} ${channel.label}`}
              type="range"
              min={channel.min}
              max={channel.max}
              step={channel.step}
              value={value[channel.key]}
              style={{ background: `linear-gradient(to right, ${gradient})` }}
              onChange={(event) => update(event.currentTarget.valueAsNumber)}
            />
            <input
              aria-label={`${label} ${channel.label} value`}
              type="number"
              min={channel.min}
              max={channel.max}
              step={10 ** -channel.precision}
              value={Number(value[channel.key].toFixed(channel.precision))}
              onChange={(event) => update(event.currentTarget.valueAsNumber)}
            />
          </div>
        );
      })}
      {!inSrgb({ mode: "oklch", ...value }) && (
        <p className="theme-help">Outside sRGB. Displays may render this differently.</p>
      )}
    </fieldset>
  );
}
