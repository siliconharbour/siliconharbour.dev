import { vi } from "vitest";

export function mockNewsletterProvider(
  provider: (url: URL, init?: RequestInit) => Promise<Response>,
) {
  vi.stubEnv("LISTS_AUTH_ISSUER", "https://auth.test");
  vi.stubEnv("LISTS_AUTH_CLIENT_ID", "fixture-client");
  vi.stubEnv("LISTS_AUTH_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("LISTS_AUTH_SCOPE", "fixture-list-scope");
  vi.stubGlobal("fetch", (input: URL | string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.origin === "https://auth.test")
      return Promise.resolve(
        Response.json(
          url.pathname.endsWith("openid-configuration")
            ? {
                issuer: url.origin,
                token_endpoint: `${url.origin}/token`,
                grant_types_supported: ["client_credentials"],
                token_endpoint_auth_methods_supported: ["client_secret_basic"],
              }
            : { access_token: "fixture-machine-token", token_type: "Bearer", expires_in: 3600 },
        ),
      );
    return provider(url, init);
  });
}
