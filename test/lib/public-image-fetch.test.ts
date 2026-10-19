import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { isIP } from "node:net";
import type { RequestOptions } from "node:https";
import type { IncomingHttpHeaders, IncomingMessage, ClientRequest } from "node:http";
import type { LookupAddress } from "node:dns";
import { get } from "node:https";
import sharp from "sharp";
import { fetchPublicImage, isPublicImageAddress } from "~/lib/public-image-fetch.server";
import { MAX_IMAGE_BYTES, validateImage } from "~/lib/image-input.server";

const dnsLookup = vi.hoisted(() =>
  vi.fn<(hostname: string, options: { all: boolean }) => Promise<LookupAddress[]>>(),
);
vi.mock("node:dns/promises", () => ({ lookup: dnsLookup }));
vi.mock("node:https", () => ({ get: vi.fn() }));
let png: Buffer;
let replies: Array<{ status?: number; headers?: IncomingHttpHeaders; chunks?: Buffer[] }>;
let connections: Array<{ hostname: string; addresses: unknown }>;
beforeEach(async () => {
  png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  replies = [];
  connections = [];
  dnsLookup.mockReset().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  vi.mocked(get)
    .mockReset()
    .mockImplementation(((
      url: URL,
      options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      const request = new EventEmitter();
      queueMicrotask(() => {
        const connected = (error: Error | null, addresses: unknown) => {
          if (error) return request.emit("error", error);
          connections.push({ hostname: url.hostname, addresses });
          const reply = replies.shift() ?? {};
          const stream = Readable.from(reply.chunks ?? [png]) as IncomingMessage;
          stream.statusCode = reply.status ?? 200;
          stream.headers = reply.headers ?? { "content-type": "image/png" };
          callback(stream);
        };
        if (options.signal?.aborted) request.emit("error", new Error("Request aborted"));
        else if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) connected(null, url.hostname);
        else options.lookup!(url.hostname, { all: true }, connected);
      });
      return request as ClientRequest;
    }) as typeof get);
});
afterEach(() => vi.restoreAllMocks());

describe("public image downloads", () => {
  it("rejects local, metadata, reserved and transition addresses in both IP families", async () => {
    for (const address of [
      "127.0.0.1",
      "0.0.0.0",
      "10.2.3.4",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "168.63.129.16",
      "100.100.100.200",
      "100.64.0.1",
      "198.18.0.1",
      "192.0.2.1",
      "224.0.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:8.8.8.8",
      "fc00::1",
      "fe80::1",
      "fec0::1",
      "64:ff9b::a00:1",
      "2002:7f00:1::",
      "2001:db8::1",
      "2001::1",
      "4000::1",
    ])
      expect(isPublicImageAddress(address), address).toBe(false);
    expect(isPublicImageAddress("8.8.8.8")).toBe(true);
    expect(isPublicImageAddress("2606:4700:4700::1111")).toBe(true);
    for (const url of [
      "http://example.com/a.png",
      "https://127.1/a",
      "https://2130706433/a",
      "https://[::1]/",
      "https://user:pass@example.com/a",
      "https://example.com:8443/a",
      "file:///tmp/a",
    ])
      await expect(fetchPublicImage(url)).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });

  it("connects using the validated DNS answers without a second resolution", async () => {
    dnsLookup
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    expect(await fetchPublicImage("https://cdn.example.com/a.png")).toEqual(png);
    expect(dnsLookup).toHaveBeenCalledTimes(1);
    expect(connections).toEqual([
      { hostname: "cdn.example.com", addresses: [{ address: "8.8.8.8", family: 4 }] },
    ]);
    expect(vi.mocked(get).mock.calls[0][1]).toMatchObject({ agent: false });
  });

  it("rejects mixed public/private DNS answers and revalidates every redirect", async () => {
    dnsLookup.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "::1", family: 6 },
    ]);
    await expect(fetchPublicImage("https://mixed.example/a")).rejects.toThrow("public addresses");
    expect(connections).toHaveLength(0);
    replies.push({ status: 302, headers: { location: "https://private.example/a" } });
    dnsLookup
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(fetchPublicImage("https://public.example/a")).rejects.toThrow("public addresses");
    expect(connections).toHaveLength(1);
  });

  it("rejects redirect downgrades, private literals and loops", async () => {
    for (const location of [
      "http://public.example/a",
      "https://169.254.169.254/latest/meta-data",
      "https://[::ffff:127.0.0.1]/",
    ]) {
      replies.push({ status: 302, headers: { location } });
      await expect(fetchPublicImage("https://public.example/a")).rejects.toThrow();
    }
    replies = Array.from({ length: 4 }, () => ({ status: 302, headers: { location: "/again" } }));
    await expect(fetchPublicImage("https://public.example/a")).rejects.toThrow("Too many");
  });

  it("caps declared and streamed sizes and checks MIME and magic bytes", async () => {
    for (const reply of [
      { headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_BYTES + 1) } },
      {
        headers: { "content-type": "image/png" },
        chunks: [Buffer.alloc(MAX_IMAGE_BYTES), Buffer.alloc(1)],
      },
      { headers: { "content-type": "text/html" } },
      { headers: { "content-type": "image/jpeg" } },
      { headers: { "content-type": "image/png", "content-encoding": "gzip" } },
      {
        headers: { "content-type": "image/png" },
        chunks: [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
      },
    ]) {
      replies.push(reply);
      await expect(fetchPublicImage("https://public.example/a")).rejects.toThrow();
    }
  });

  it("uses one overall request deadline", async () => {
    const deadline = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    await expect(fetchPublicImage("https://public.example/a")).rejects.toThrow("aborted");
    expect(deadline).toHaveBeenCalledWith(20_000);
  });

  it("rejects decompression bombs and animated images before processing", async () => {
    const oversized = await sharp({
      create: { width: 4096, height: 4096, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(validateImage(oversized, "image/png")).rejects.toThrow("16 megapixels");
    const frames = Buffer.alloc(2 * 4 * 4 * 3);
    frames.fill(255, 4 * 4 * 3);
    const animated = await sharp(frames, {
      raw: { width: 4, height: 8, channels: 3, pageHeight: 4 },
    })
      .gif({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expect(validateImage(animated, "image/gif")).rejects.toThrow("static");
  });
});
