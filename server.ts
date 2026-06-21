import { createSiliconHarbourHttpApp } from "./app/mcp/http-app.js";

const app = await createSiliconHarbourHttpApp();

const PORT = process.env.PORT || 3000;
// In production we default to 0.0.0.0 so that a containerized deploy is
// reachable from outside the container's network namespace (Traefik /
// reverse proxies hit us through the Docker bridge, not over loopback).
// In development we default to 127.0.0.1 to keep `pnpm dev` off the LAN
// unless the developer explicitly opts in by setting HOST.
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
app.listen(Number(PORT), HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
