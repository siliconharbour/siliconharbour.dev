import { beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { request } from "node:https";
import type { RequestOptions } from "node:https";
import type { IncomingMessage, ClientRequest, IncomingHttpHeaders } from "node:http";
import { publicFetch } from "~/lib/public-network-fetch.server";
const dns = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup: dns }));
vi.mock("node:https", () => ({ request: vi.fn() }));
let replies: Array<{ status?: number; headers?: IncomingHttpHeaders; body?: Buffer }>;
let sent: Array<{ url: URL; options: RequestOptions; body?: Buffer }>;
beforeEach(() => {
  replies = [];
  sent = [];
  dns.mockReset().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  vi.mocked(request)
    .mockReset()
    .mockImplementation(((
      url: URL,
      options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      const outgoing = Object.assign(new EventEmitter(), {
        end: (body?: Buffer) => {
          sent.push({ url, options, body });
          queueMicrotask(() => {
            options.lookup!(url.hostname, { all: true }, (error) => {
              if (error) {
                outgoing.emit("error", error);
                return;
              }
              const reply = replies.shift() ?? {};
              const incoming = Readable.from([reply.body ?? Buffer.from("ok")]) as IncomingMessage;
              incoming.statusCode = reply.status ?? 200;
              incoming.statusMessage = "Mock response";
              incoming.headers = reply.headers ?? { "content-type": "text/plain" };
              callback(incoming);
            });
          });
        },
      });
      return outgoing as ClientRequest;
    }) as typeof request);
});
it("preserves POST payloads, provider error status, and retry headers", async () => {
  replies.push({
    status: 429,
    headers: { "retry-after": "30", "content-type": "application/json" },
    body: Buffer.from('{"error":"limited"}'),
  });
  const response = await publicFetch("https://api.example.com/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"offset":20}',
  });
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("30");
  expect(await response.json()).toEqual({ error: "limited" });
  expect(sent[0].options.method).toBe("POST");
  expect(sent[0].body?.toString()).toBe('{"offset":20}');
});
it("revalidates redirects and refuses private DNS answers before receiving data", async () => {
  replies.push({ status: 302, headers: { location: "https://127.0.0.1/private" } });
  await expect(publicFetch("https://example.com/start")).rejects.toThrow("public addresses");
  expect(sent).toHaveLength(1);
  dns.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
  await expect(publicFetch("https://example.com/rebound")).rejects.toThrow("public addresses");
});
it("drops credentials and changes POST to GET on a cross-origin 303", async () => {
  replies.push(
    { status: 303, headers: { location: "https://other.example.com/result" } },
    { body: Buffer.from("done") },
  );
  const response = await publicFetch("https://example.com/start", {
    method: "POST",
    headers: {
      authorization: "Bearer private",
      cookie: "secret=value",
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(await response.text()).toBe("done");
  expect(sent[1].options.method).toBe("GET");
  expect(sent[1].body).toBeUndefined();
  expect(sent[1].options.headers).not.toHaveProperty("authorization");
  expect(sent[1].options.headers).not.toHaveProperty("cookie");
});
it("decodes compressed provider responses and bounds the decoded size", async () => {
  replies.push({
    headers: { "content-encoding": "gzip" },
    body: gzipSync(Buffer.from("compressed content")),
  });
  expect(await (await publicFetch("https://example.com/page")).text()).toBe("compressed content");
  replies.push({
    headers: { "content-encoding": "gzip" },
    body: gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1)),
  });
  await expect(publicFetch("https://example.com/large")).rejects.toThrow("size limit");
});
