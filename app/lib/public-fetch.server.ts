import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
export class PublicFetchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const GLOBAL_IPV6_RANGE = ipaddr.IPv6.parseCIDR("2000::/3");
const AZURE_PLATFORM_ADDRESS = "168.63.129.16";

export function isPublicAddress(address: string): boolean {
  if (!isIP(address)) return false;
  const ip = ipaddr.parse(address);
  if (ip.range() !== "unicast" || address === AZURE_PLATFORM_ADDRESS) return false;
  return ip.kind() === "ipv4" || ip.match(GLOBAL_IPV6_RANGE);
}
function publicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicFetchError("Invalid URL.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password)
    throw new PublicFetchError("URLs must use HTTPS on port 443 without credentials.");
  if (isIP(hostname) && !isPublicAddress(hostname))
    throw new PublicFetchError("URL must resolve only to public addresses.");
  return url;
}

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
          // Resolve once inside the connection lookup, so DNS rebinding cannot bypass validation.
          lookup(hostname, options, callback) {
            lookup(hostname, { all: true })
              .then((addresses) => {
                if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
                  throw new PublicFetchError("URL must resolve only to public addresses.");
                if (options.all) callback(null, addresses);
                else callback(null, addresses[0].address, addresses[0].family);
              })
              .catch((error: Error) => callback(error, "", 0));
          },
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
