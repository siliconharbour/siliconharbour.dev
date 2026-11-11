import { execFileSync } from "node:child_process";

export const REMOTE_HOST = "jack@jackharrhy.dev";
export const CONTAINER = "mug-siliconharbour-1";
export const IMAGE = "ghcr.io/siliconharbour/siliconharbour.dev:main";
export const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export function ssh(command: string, options?: { stdio?: "inherit" | "pipe" }) {
  return (
    execFileSync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=3",
        REMOTE_HOST,
        command,
      ],
      {
        stdio: options?.stdio ?? "pipe",
        encoding: "utf8",
      },
    )?.toString() ?? ""
  );
}
