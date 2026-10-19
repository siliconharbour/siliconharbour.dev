import { createContext, type RouterContextProvider } from "react-router";
import { isIP } from "node:net";

// The HTTP adapter and the Vite server bundle must share this context key.
const registry = globalThis as typeof globalThis & {
  __siliconHarbourIpContext?: ReturnType<typeof createContext<string>>;
};
export const clientIpContext = (registry.__siliconHarbourIpContext ??=
  createContext<string>("unknown"));
export function requestIp(context: Pick<RouterContextProvider, "get">) {
  const address = context.get(clientIpContext);
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (!isIP(ip)) throw new Response("Client address unavailable.", { status: 503 });
  return ip;
}
