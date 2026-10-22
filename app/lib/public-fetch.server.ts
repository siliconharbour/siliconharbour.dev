import { get } from "node:https";
import { publicUrl, publicLookup, PublicFetchError } from "./public-address.server";
export { isPublicAddress, PublicFetchError } from "./public-address.server";
export async function fetchPublicBytes(
  value: string,
  options: { accept: string; maxBytes: number },
): Promise<{ bytes: Buffer; contentType: string }> {
  const signal = AbortSignal.timeout(20_000);
  let url = publicUrl(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
      const request = get(
        url,
        {
          agent: false,
          signal,
          headers: {
            "User-Agent": "siliconharbour.dev/1.0",
            Accept: options.accept,
            "Accept-Encoding": "identity",
          },
          lookup: publicLookup,
        },
        resolve,
      );
      request.on("error", reject);
    });
    try {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        if (redirect === 3 || !response.headers.location)
          throw new PublicFetchError("Too many redirects.");
        url = publicUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.statusCode !== 200)
        throw new PublicFetchError(`Remote server returned HTTP ${response.statusCode}.`);
      const contentType = response.headers["content-type"] ?? "";
      if (
        response.headers["content-encoding"] &&
        response.headers["content-encoding"] !== "identity"
      )
        throw new PublicFetchError("Compressed responses are not supported.");
      if (Number(response.headers["content-length"]) > options.maxBytes)
        throw new PublicFetchError("URL exceeds the response size limit.", 413);
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of response) {
        size += chunk.length;
        if (size > options.maxBytes)
          throw new PublicFetchError("URL exceeds the response size limit.", 413);
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      return { bytes, contentType };
    } finally {
      response.destroy();
    }
  }
  throw new PublicFetchError("Too many redirects.");
}

export async function fetchPublicPage(url: string): Promise<string> {
  const { bytes, contentType } = await fetchPublicBytes(url, {
    accept: "text/html,application/xhtml+xml",
    maxBytes: 2 * 1024 * 1024,
  });
  if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(contentType))
    throw new PublicFetchError("Expected an HTML page");
  return bytes.toString("utf8");
}
