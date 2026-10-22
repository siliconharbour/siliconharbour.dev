import { request as httpsRequest } from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { publicUrl, publicLookup, PublicFetchError } from "./public-address.server";
const MAX_BYTES = 16 * 1024 * 1024;
export async function publicFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  let url = publicUrl(request.url);
  let method = request.method;
  let bytes =
    method === "GET" || method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());
  if (bytes && bytes.length > MAX_BYTES)
    throw new PublicFetchError("Request exceeds the size limit", 413);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("accept-encoding", "identity");
  if (!headers.has("user-agent")) headers.set("user-agent", "siliconharbour.dev/1.0");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
      const outgoing = httpsRequest(
        url,
        {
          method,
          headers: Object.fromEntries(headers),
          signal,
          agent: false,
          lookup: publicLookup,
        },
        resolve,
      );
      outgoing.on("error", reject);
      outgoing.end(bytes);
    });
    let body: import("node:stream").Readable = response;
    try {
      const status = response.statusCode ?? 502;
      if ([301, 302, 303, 307, 308].includes(status) && request.redirect !== "manual") {
        if (request.redirect === "error") throw new PublicFetchError("Redirects are not allowed");
        if (redirects === 3 || !response.headers.location)
          throw new PublicFetchError("Too many redirects");
        const next = publicUrl(new URL(response.headers.location, url).href);
        if (next.origin !== url.origin) {
          headers.delete("authorization");
          headers.delete("cookie");
        }
        if (
          (status === 303 && method !== "HEAD") ||
          ([301, 302].includes(status) && method === "POST")
        ) {
          method = "GET";
          bytes = undefined;
          headers.delete("content-type");
          headers.delete("content-length");
        }
        url = next;
        continue;
      }
      if (Number(response.headers["content-length"]) > MAX_BYTES)
        throw new PublicFetchError("Response exceeds the size limit", 413);
      const encoding = response.headers["content-encoding"];
      const decoder =
        encoding === "gzip"
          ? createGunzip()
          : encoding === "br"
            ? createBrotliDecompress()
            : encoding === "deflate"
              ? createInflate()
              : null;
      if (encoding && encoding !== "identity" && !decoder)
        throw new PublicFetchError("Unsupported content encoding");
      if (decoder) {
        response.on("error", (error) => decoder.destroy(error));
        body = response.pipe(decoder);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of body) {
        const data = Buffer.from(chunk);
        size += data.length;
        if (size > MAX_BYTES) throw new PublicFetchError("Response exceeds the size limit", 413);
        chunks.push(data);
      }
      const resultHeaders = new Headers();
      for (const [key, value] of Object.entries(response.headers))
        for (const entry of Array.isArray(value) ? value : value ? [value] : [])
          resultHeaders.append(key, entry);
      resultHeaders.delete("content-encoding");
      resultHeaders.delete("content-length");
      return new Response(
        method === "HEAD" || [204, 205, 304].includes(status) ? null : Buffer.concat(chunks),
        { status, statusText: response.statusMessage, headers: resultHeaders },
      );
    } finally {
      body.destroy();
      response.destroy();
    }
  }
  throw new PublicFetchError("Too many redirects");
}
