import { fetchPublicBytes, PublicFetchError } from "~/lib/public-fetch.server";

export async function fetchPublicFeed(url: string) {
  const { bytes, contentType } = await fetchPublicBytes(url, {
    accept: "application/rss+xml,application/atom+xml,application/xml,text/xml",
    maxBytes: 4 * 1024 * 1024,
  });
  if (!/^(application\/(rss\+xml|atom\+xml|xml)|text\/(xml|plain))(;|$)/i.test(contentType))
    throw new PublicFetchError("Expected an RSS or Atom feed");
  return bytes.toString("utf8");
}
