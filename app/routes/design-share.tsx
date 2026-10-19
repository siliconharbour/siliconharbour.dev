import DesignSystem from "./design";
import { loadDesignExamples } from "~/lib/design-examples.server";
import { getThemeShare } from "~/lib/theme-shares.server";

export async function loader({ params }: { params: { id: string } }) {
  const share = getThemeShare(params.id);
  return { ...(await loadDesignExamples()), share };
}
export function headers() {
  return { "Cache-Control": "no-store" };
}
export function meta() {
  return [
    { title: "Shared theme - siliconharbour.dev" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export default DesignSystem;
