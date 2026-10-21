/**
 * Email component that prevents scraping by bots
 * Constructs the email address client-side on click
 */
export function ObfuscatedEmail() {
  const user = "admin";
  const domain = "siliconharbour";
  const tld = "dev";

  const handleClick = () => {
    window.location.href = `mai${"lt"}o:${user}@${domain}.${tld}`;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-body hover:text-heading underline decoration-harbour-300 hover:decoration-harbour-500 transition-colors"
    >
      {user} [at] {domain} [dot] {tld}
    </button>
  );
}
