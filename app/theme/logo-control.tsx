import { useTheme } from "./provider";

export function LogoControl() {
  const { logo, setLogo, uploadLogo, logoError, logoLoading } = useTheme();
  return (
    <details className="theme-details">
      <summary>Logo</summary>
      <label className="theme-field">
        Choose logo
        <input
          type="file"
          accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif,image/avif"
          aria-label="Choose logo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadLogo(file);
          }}
        />
      </label>
      {logoLoading && <p role="status">Preparing image…</p>}
      {logoError && (
        <p className="theme-notice" role="alert">
          {logoError}
        </p>
      )}
      {logo && (
        <>
          <img className="theme-logo-preview" src={logo.src} alt="Your preview logo" />
          <p className="theme-help">{logo.name}</p>
          <button className="theme-small-button" type="button" onClick={() => setLogo(null)}>
            Use original logo
          </button>
        </>
      )}
      <p className="theme-help">SVG or image, up to 5 MB. Included in shared links.</p>
    </details>
  );
}
