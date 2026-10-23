import { fetchPublicPage } from "./public-fetch.server";
export async function fetchNewsLinkMetadata(url: string) {
  const html = await fetchPublicPage(url);
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1].trim() || new URL(url).hostname;
  const excerpt =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1].trim() ??
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1].trim() ??
    null;
  return { title, excerpt, sourceName: new URL(url).hostname.replace(/^www\./, "") };
}
