import { describe, it, expect } from "vitest";
import {
  PermissionFlagsBits,
  OverwriteType,
  type APIGuildChannel,
  type APIGuildMember,
  type APIRole,
  type ChannelType,
} from "discord-api-types/v10";
import { computeBotChannelPermissions } from "~/lib/discord.server";

// =============================================================================
// Helpers
// =============================================================================

const GUILD_ID = "100";
const BOT_USER_ID = "999";
const VIEW_AND_SEND = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;

function role(id: string, perms: bigint, position = 0, name = `role-${id}`): APIRole {
  return {
    id,
    name,
    position,
    permissions: perms.toString(),
    color: 0,
    hoist: false,
    managed: false,
    mentionable: false,
  };
}

function member(roles: string[]): APIGuildMember {
  return {
    user: {
      id: BOT_USER_ID,
      username: "bot",
      discriminator: "0000",
      avatar: null,
      global_name: null,
    },
    roles,
    joined_at: "2024-01-01T00:00:00.000Z",
    deaf: false,
    mute: false,
    flags: 0,
  };
}

function channel(
  overwrites: NonNullable<APIGuildChannel<ChannelType>["permission_overwrites"]> = [],
): Pick<APIGuildChannel<ChannelType>, "permission_overwrites"> {
  return { permission_overwrites: overwrites };
}

// =============================================================================
// Tests
// =============================================================================

describe("computeBotChannelPermissions", () => {
  it("admin bot can post anywhere regardless of overwrites", () => {
    const everyone = role(GUILD_ID, 0n);
    const adminRole = role("200", PermissionFlagsBits.Administrator);

    // even with explicit deny overwrites
    const ch = channel([
      { id: GUILD_ID, type: OverwriteType.Role, allow: "0", deny: VIEW_AND_SEND.toString() },
      { id: BOT_USER_ID, type: OverwriteType.Member, allow: "0", deny: VIEW_AND_SEND.toString() },
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
        type: OverwriteType.Role,
        allow: "0",
        deny: PermissionFlagsBits.SendMessages.toString(),
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
        type: OverwriteType.Role,
        allow: "0",
        deny: PermissionFlagsBits.ViewChannel.toString(),
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
        type: OverwriteType.Role,
        allow: "0",
        deny: PermissionFlagsBits.SendMessages.toString(),
      },
      {
        id: "200",
        type: OverwriteType.Role,
        allow: PermissionFlagsBits.SendMessages.toString(),
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
        type: OverwriteType.Role,
        allow: PermissionFlagsBits.SendMessages.toString(),
        deny: "0",
      },
      {
        id: BOT_USER_ID,
        type: OverwriteType.Member,
        allow: "0",
        deny: PermissionFlagsBits.SendMessages.toString(),
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
