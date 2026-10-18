import { useTheme } from "./provider";

export function LogoControl() {
  const { logo, setLogo, uploadLogo, logoError, logoLoading } = useTheme();
  return (
    <section className="theme-control-section" aria-label="Brand graphic">
      <h3>Brand graphic</h3>
      <p className="theme-help">
        Choose an SVG or image, up to 5 MB. It stays in this browser and appears in the header and
        social previews.
      </p>
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
      <p className="theme-help">
        Theme links share styles only. Download social previews to share your logo; reloading the
        page clears it.
      </p>
    </section>
  );
}
