import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import type { RequestOptions } from "node:https";
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
export function publicUrl(value: string): URL {
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

export const publicLookup: NonNullable<RequestOptions["lookup"]> = (
  hostname,
  options,
  callback,
) => {
  lookup(hostname, { all: true })
    .then((addresses) => {
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
        throw new PublicFetchError("URL must resolve only to public addresses.");
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    })
    .catch((error: Error) => callback(error, "", 0));
};
