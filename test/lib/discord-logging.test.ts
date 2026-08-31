import { afterEach, describe, expect, it, vi } from "vitest";
import { DefaultRestOptions } from "@discordjs/rest";
import { discordErrorDetails, logDiscord } from "~/lib/discord-logging.server";
import { postMessage } from "~/lib/discord.server";

describe("Discord structured logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes a one-line JSON record with correlation fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logDiscord("info", "batch.started", {
      requestId: "request-1",
      batchId: "batch-1",
      itemIds: [10, 11],
    });

    expect(info).toHaveBeenCalledOnce();
    const line = info.mock.calls[0][0] as string;
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({
      level: "info",
      scope: "discord",
      event: "batch.started",
      requestId: "request-1",
      batchId: "batch-1",
      itemIds: [10, 11],
    });
  });

  it("extracts useful error fields without serializing the full error", () => {
    const error = Object.assign(new Error("Discord unavailable"), {
      status: 503,
      code: "upstream_failure",
      requestBody: { token: "must-not-be-logged" },
    });

    const details = discordErrorDetails(error);

    expect(details).toEqual({
      errorName: "Error",
      errorMessage: "Discord unavailable",
      httpStatus: 503,
      discordCode: "upstream_failure",
    });
    expect(JSON.stringify(details)).not.toContain("must-not-be-logged");
  });

  it("correlates a physical Discord send without logging its token or content", async () => {
    vi.spyOn(DefaultRestOptions, "makeRequest").mockResolvedValue(
      new Response(JSON.stringify({ id: "discord-message-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await postMessage(
      "channel-1",
      [{ type: 10, content: "private message contents" }],
      "secret-bot-token",
      {
        requestId: "request-1",
        batchId: "batch-1",
        channelType: "jobs",
        destinationId: 1,
        guildId: "guild-1",
        guildName: "Test Guild",
        channelId: "channel-1",
        channelName: "jobs",
        chunkIndex: 1,
        chunkCount: 1,
      },
    );

    expect(result).toEqual({ success: true, messageId: "discord-message-1" });
    const lines = info.mock.calls.map(([line]) => line as string);
    expect(lines.map((line) => JSON.parse(line).event)).toEqual([
      "message.send_started",
      "rest.response",
      "message.send_succeeded",
    ]);
    expect(lines.join("\n")).not.toContain("secret-bot-token");
    expect(lines.join("\n")).not.toContain("private message contents");
    expect(JSON.parse(lines.at(-1) ?? "{}")).toMatchObject({
      discordMessageId: "discord-message-1",
      physicalAttemptCount: 1,
      responseCount: 1,
    });
  });
});
