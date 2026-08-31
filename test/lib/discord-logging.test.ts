import { afterEach, describe, expect, it, vi } from "vitest";
import { REST } from "@discordjs/rest";
import { postMessage } from "~/lib/discord.server";

describe("Discord structured logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("correlates a Discord send without logging its token or content", async () => {
    vi.spyOn(REST.prototype, "post").mockResolvedValue({ id: "discord-message-1" });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await postMessage(
      "channel-1",
      [{ type: 10, content: "private message contents" }],
      "secret-bot-token",
      {
        batchId: "batch-1",
        channelType: "jobs",
        destinationId: 1,
        chunkIndex: 1,
        chunkCount: 1,
      },
    );

    expect(result).toEqual({ success: true, messageId: "discord-message-1" });
    expect(info).toHaveBeenCalledOnce();
    const line = info.mock.calls[0][0] as string;
    expect(line).not.toContain("\n");
    expect(line).not.toContain("secret-bot-token");
    expect(line).not.toContain("private message contents");
    expect(JSON.parse(line)).toMatchObject({
      scope: "discord",
      event: "message.sent",
      batchId: "batch-1",
      chunkIndex: 1,
      chunkCount: 1,
      discordMessageId: "discord-message-1",
    });
  });
});
