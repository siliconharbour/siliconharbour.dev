import { useEffect, useId, useState } from "react";
import { FONT_PRESETS, fontSchema } from "./fonts";

export function FontField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (family: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(value);
    setError("");
  }, [value]);
  return (
    <form
      className="theme-font"
      onSubmit={(event) => {
        event.preventDefault();
        const result = fontSchema.safeParse(draft);
        if (!result.success) {
          setError("Enter a font family name, without CSS or a URL (up to 100 characters).");
          return;
        }
        setError("");
        setDraft(result.data);
        onChange(result.data);
      }}
    >
      <label className="theme-field" htmlFor={id}>
        {label}
      </label>
      <div className="theme-font-input">
        <input
          id={id}
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          list={`${id}-options`}
          value={draft}
          maxLength={100}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" aria-label={`Apply ${label.toLowerCase()}`}>
          Apply
        </button>
      </div>
      <datalist id={`${id}-options`}>
        {FONT_PRESETS.map((font) => (
          <option key={font.value} value={font.value}>
            {font.label}
          </option>
        ))}
      </datalist>
      {error && (
        <p id={`${id}-error`} className="theme-notice">
          {error}
        </p>
      )}
    </form>
  );
}
