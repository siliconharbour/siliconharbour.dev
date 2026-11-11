import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ssh: vi.fn(), question: vi.fn(), close: vi.fn() }));
vi.mock("../../scripts/production", async (original) => ({
  ...(await original<typeof import("../../scripts/production")>()),
  ssh: mocks.ssh,
}));
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({ question: mocks.question, close: mocks.close }),
}));
const argv = process.argv;
beforeEach(() => {
  vi.resetModules();
  mocks.ssh
    .mockReset()
    .mockImplementation((command: string) =>
      command.includes("image inspect") ? `sha256:${"a".repeat(64)} ${"b".repeat(40)}` : "",
    );
  mocks.question.mockReset().mockResolvedValue("yes");
  mocks.close.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  process.argv = [process.execPath, "scripts/migrate-prod.ts"];
});
afterEach(() => {
  process.argv = argv;
  vi.restoreAllMocks();
});
it("runs a pinned offline migration against the live volume with backup and no container replacement", async () => {
  await import("../../scripts/migrate-prod");
  const commands = mocks.ssh.mock.calls.map(([command]) => String(command));
  const run = commands.find((command) => command.startsWith("docker run"));
  expect(run).toContain(`'sha256:${"a".repeat(64)}'`);
  expect(run).toContain("--network none --volumes-from mug-siliconharbour-1");
  expect(run).toContain("--existing --backup-dir /app/data/backups");
  expect(commands.join("\n")).not.toMatch(/docker compose|docker stop|rsync/);
  expect(mocks.close).toHaveBeenCalledOnce();
});
it("rejects untrusted image syntax before SSH and respects an operator abort", async () => {
  process.argv.push("--image", "anything; touch /tmp/should-not-exist");
  await expect(import("../../scripts/migrate-prod")).rejects.toThrow(
    /Choose a Silicon Harbour image/,
  );
  expect(mocks.ssh).not.toHaveBeenCalled();
  vi.resetModules();
  process.argv = [process.execPath, "scripts/migrate-prod.ts"];
  mocks.question.mockResolvedValue("no");
  await import("../../scripts/migrate-prod");
  expect(mocks.ssh.mock.calls.some(([command]) => String(command).startsWith("docker run"))).toBe(
    false,
  );
});
