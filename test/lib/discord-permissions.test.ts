import { describe, it, expect } from "vitest";
import {
  computeBotChannelPermissions,
  PERMISSION_BITS,
  type DiscordChannel,
  type DiscordGuildMember,
  type DiscordRole,
} from "~/lib/discord.server";

// =============================================================================
// Helpers
// =============================================================================

const GUILD_ID = "100";
const BOT_USER_ID = "999";

function role(id: string, perms: bigint, position = 0, name = `role-${id}`): DiscordRole {
  return { id, name, position, permissions: perms.toString() };
}

function member(roles: string[]): DiscordGuildMember {
  return { user: { id: BOT_USER_ID }, roles };
}

function channel(
  overwrites: NonNullable<DiscordChannel["permission_overwrites"]> = [],
): Pick<DiscordChannel, "permission_overwrites"> {
  return { permission_overwrites: overwrites };
}

const VIEW_AND_SEND = PERMISSION_BITS.VIEW_CHANNEL | PERMISSION_BITS.SEND_MESSAGES;

// =============================================================================
// Tests
// =============================================================================

describe("computeBotChannelPermissions", () => {
  it("admin bot can post anywhere regardless of overwrites", () => {
    const everyone = role(GUILD_ID, 0n);
    const adminRole = role("200", PERMISSION_BITS.ADMINISTRATOR);

    // even with explicit deny overwrites
    const ch = channel([
      { id: GUILD_ID, type: 0, allow: "0", deny: VIEW_AND_SEND.toString() },
      { id: BOT_USER_ID, type: 1, allow: "0", deny: VIEW_AND_SEND.toString() },
    ]);

    const result = computeBotChannelPermissions(
      ch,
      [everyone, adminRole],
      member(["200"]),
      GUILD_ID,
    );

    expect(result).toEqual({ canView: true, canSend: true, isAdmin: true });
  });

  it("base permissions from @everyone allow posting in a default channel", () => {
    const everyone = role(GUILD_ID, VIEW_AND_SEND);

    const result = computeBotChannelPermissions(channel(), [everyone], member([]), GUILD_ID);

    expect(result.canSend).toBe(true);
    expect(result.canView).toBe(true);
    expect(result.isAdmin).toBe(false);
  });

  it("@everyone overwrite denying SEND_MESSAGES blocks posting", () => {
    const everyone = role(GUILD_ID, VIEW_AND_SEND);

    const ch = channel([
      {
        id: GUILD_ID,
        type: 0,
        allow: "0",
        deny: PERMISSION_BITS.SEND_MESSAGES.toString(),
      },
    ]);

    const result = computeBotChannelPermissions(ch, [everyone], member([]), GUILD_ID);

    expect(result.canView).toBe(true);
    expect(result.canSend).toBe(false);
  });

  it("denying VIEW_CHANNEL implicitly denies SEND_MESSAGES", () => {
    const everyone = role(GUILD_ID, VIEW_AND_SEND);

    const ch = channel([
      {
        id: GUILD_ID,
        type: 0,
        allow: "0",
        deny: PERMISSION_BITS.VIEW_CHANNEL.toString(),
      },
    ]);

    const result = computeBotChannelPermissions(ch, [everyone], member([]), GUILD_ID);

    expect(result.canView).toBe(false);
    expect(result.canSend).toBe(false);
  });

  it("role overwrite allow overrides @everyone deny", () => {
    const everyone = role(GUILD_ID, VIEW_AND_SEND);
    const botRole = role("200", 0n);

    const ch = channel([
      {
        id: GUILD_ID,
        type: 0,
        allow: "0",
        deny: PERMISSION_BITS.SEND_MESSAGES.toString(),
      },
      {
        id: "200",
        type: 0,
        allow: PERMISSION_BITS.SEND_MESSAGES.toString(),
        deny: "0",
      },
    ]);

    const result = computeBotChannelPermissions(
      ch,
      [everyone, botRole],
      member(["200"]),
      GUILD_ID,
    );

    expect(result.canSend).toBe(true);
  });

  it("member-specific deny overrides role allow", () => {
    const everyone = role(GUILD_ID, VIEW_AND_SEND);
    const botRole = role("200", 0n);

    const ch = channel([
      {
        id: "200",
        type: 0,
        allow: PERMISSION_BITS.SEND_MESSAGES.toString(),
        deny: "0",
      },
      {
        id: BOT_USER_ID,
        type: 1,
        allow: "0",
        deny: PERMISSION_BITS.SEND_MESSAGES.toString(),
      },
    ]);

    const result = computeBotChannelPermissions(
      ch,
      [everyone, botRole],
      member(["200"]),
      GUILD_ID,
    );

    expect(result.canSend).toBe(false);
    expect(result.canView).toBe(true);
  });

  it("no permissions at all blocks posting", () => {
    const everyone = role(GUILD_ID, 0n);

    const result = computeBotChannelPermissions(channel(), [everyone], member([]), GUILD_ID);

    expect(result.canView).toBe(false);
    expect(result.canSend).toBe(false);
  });
});
