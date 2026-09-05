import { afterEach, describe, expect, it, vi } from "vitest";
import { REST } from "@discordjs/rest";
import { MessageFlags, Routes } from "discord-api-types/v10";
import { postMessage } from "~/lib/discord.server";

describe("Discord structured logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("correlates a Discord send without logging its token or content", async () => {
    const post = vi.spyOn(REST.prototype, "post").mockResolvedValue({ id: "discord-message-1" });
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
    expect(post).toHaveBeenCalledWith(Routes.channelMessages("channel-1"), {
      body: {
        flags: MessageFlags.IsComponentsV2,
        components: [{ type: 10, content: "private message contents" }],
        nonce: expect.stringMatching(/^[a-f0-9]{25}$/),
        enforce_nonce: true,
      },
    });
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
      nonce: expect.stringMatching(/^[a-f0-9]{25}$/),
      discordMessageId: "discord-message-1",
    });
  });

  it("reuses a nonce for retries of the same batch chunk", async () => {
    const post = vi
      .spyOn(REST.prototype, "post")
      .mockResolvedValueOnce({ id: "discord-message-1" })
      .mockResolvedValueOnce({ id: "discord-message-1" })
      .mockResolvedValueOnce({ id: "discord-message-2" });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const context = {
      batchId: "batch-1",
      channelType: "jobs" as const,
      destinationId: 1,
      chunkIndex: 1,
      chunkCount: 2,
    };

    await postMessage("channel-1", [], "secret-bot-token", context);
    await postMessage("channel-1", [], "secret-bot-token", context);
    await postMessage("channel-1", [], "secret-bot-token", { ...context, chunkIndex: 2 });

    const nonce = (callIndex: number) =>
      (post.mock.calls[callIndex][1] as { body: { nonce: string } }).body.nonce;
    expect(nonce(0)).toBe(nonce(1));
    expect(nonce(2)).not.toBe(nonce(0));
  });
});
