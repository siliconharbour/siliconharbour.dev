import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { createRequestHandler } from "@react-router/express";
import type { ActionFunctionArgs, ServerBuild } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSiliconHarbourHttpApp } from "~/mcp/http-app";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("form actions behind Traefik", () => {
  it.each([
    ["https://siliconharbour.dev", 200],
    ["https://other.example", 400],
    ["http://siliconharbour.dev", 400],
  ])("checks origin %s against the forwarded HTTPS URL", async (origin, expectedStatus) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://siliconharbour.dev");
    vi.stubEnv("OAUTH_ISSUER_URL", "https://siliconharbour.dev");
    const action = vi.fn(async ({ request }: ActionFunctionArgs) => ({
      url: request.url,
      fields: Object.fromEntries(await request.formData()),
    }));
    const build = {
      entry: { module: { default: () => new Response(), handleError: () => {} } },
      routes: {
        review: { id: "review", path: "manage/review", module: { default: () => null, action } },
      },
      assets: {
        entry: { imports: [], module: "" },
        routes: {},
        url: "",
        version: "test",
      },
      publicPath: "/",
      assetsBuildDirectory: "build/client",
      future: {},
      ssr: true,
      isSpaMode: false,
      prerender: [],
      routeDiscovery: { mode: "initial", manifestPath: "/__manifest" },
    } satisfies ServerBuild;
    const app = await createSiliconHarbourHttpApp({ includeFrontend: false });
    app.all("/{*path}", createRequestHandler({ build, mode: "production" }));
    const server = app.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP port");
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const request = httpRequest({
          hostname: "127.0.0.1",
          port: address.port,
          path: "/manage/review.data",
          method: "POST",
          headers: {
            Host: "siliconharbour.dev",
            "X-Forwarded-Host": "siliconharbour.dev",
            "X-Forwarded-Proto": "https",
            Origin: origin,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }, (response) => {
          response.resume();
          response.on("error", reject);
          response.on("end", () => resolve(response.statusCode));
        });
        request.on("error", reject);
        request.end(new URLSearchParams({ kind: "event", action: "approve", id: "1" }).toString());
      });
      expect(status).toBe(expectedStatus);
      expect(action).toHaveBeenCalledTimes(expectedStatus === 200 ? 1 : 0);
      if (expectedStatus === 200) {
        await expect(action.mock.results[0]!.value).resolves.toEqual({
          url: "https://siliconharbour.dev/manage/review.data",
          fields: { kind: "event", action: "approve", id: "1" },
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
