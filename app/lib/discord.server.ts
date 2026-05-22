import { REST, DiscordAPIError, HTTPError } from "@discordjs/rest";
import {
  Routes,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  OverwriteType,
  type APIGuild,
  type APIChannel,
  type APIGuildChannel,
  type APIRole,
  type APIGuildMember,
  type APIOverwrite,
  type APIUser,
  type RESTGetAPICurrentUserGuildsResult,
  type RESTGetAPIGuildChannelsResult,
  type RESTGetAPIGuildMemberResult,
  type RESTGetAPIGuildRolesResult,
  type RESTPostAPIChannelMessageResult,
} from "discord-api-types/v10";

// =============================================================================
// REST client
// =============================================================================

/**
 * Build a per-token REST client. We don't share a singleton because the bot
 * token can change at runtime via the settings page, and @discordjs/rest binds
 * its auth header at setToken time.
 *
 * The library handles rate limits (global + per-route + the sublimit bucket on
 * POST /channels/{id}/messages), retries 5xx with backoff, and surfaces
 * structured errors via DiscordAPIError.
 */
function makeRest(token: string): REST {
  return new REST({ version: "10" }).setToken(token);
}

/**
 * Normalise any error thrown by @discordjs/rest into a string the UI can show.
 */
function formatError(error: unknown): string {
  if (error instanceof DiscordAPIError) {
    return `Discord API error ${error.status}: ${error.message}`;
  }
  if (error instanceof HTTPError) {
    return `HTTP ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Unknown error";
}

// =============================================================================
// Token verification
// =============================================================================

export interface VerifyResult {
  valid: boolean;
  username?: string;
  userId?: string;
  error?: string;
}

/**
 * Verify a Discord bot token by calling GET /users/@me.
 */
export async function verifyBotToken(token: string): Promise<VerifyResult> {
  try {
    const user = (await makeRest(token).get(Routes.user())) as APIUser;
    return { valid: true, username: user.username, userId: user.id };
  } catch (error) {
    return { valid: false, error: formatError(error) };
  }
}

// =============================================================================
// Posting
// =============================================================================

export interface PostMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Post a Components v2 message to a Discord channel.
 *
 * `components` is the components array; this function wraps it with the
 * IS_COMPONENTS_V2 flag so callers don't have to know about it.
 */
export async function postMessage(
  channelId: string,
  components: object[],
  token: string,
): Promise<PostMessageResult> {
  try {
    const result = (await makeRest(token).post(Routes.channelMessages(channelId), {
      body: {
        flags: MessageFlags.IsComponentsV2,
        components,
      },
    })) as RESTPostAPIChannelMessageResult;
    return { success: true, messageId: result.id };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

// =============================================================================
// Guilds + channels + permissions
// =============================================================================

/** Channel types we'll accept as text destinations. */
export const TEXT_CHANNEL_TYPES = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
]);

// ----- in-memory cache (per-process) -----
// Keyed on token + endpoint key with a small TTL so the settings page stays
// snappy without making us beg the Discord rate limiter on every render.

interface CacheEntry<T> {
  expires: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60_000;

function cacheKey(token: string, parts: string[]): string {
  // Hash-ish: take last 8 chars of token so we don't risk logging it; collisions
  // are fine because we'd only mix entries between two bots sharing a process.
  return `${token.slice(-8)}::${parts.join(":")}`;
}

async function cached<T>(token: string, parts: string[], fn: () => Promise<T>): Promise<T> {
  const key = cacheKey(token, parts);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.value as T;
  }
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Clear the in-memory Discord cache. Call after writes that affect listings. */
export function clearDiscordCache(): void {
  cache.clear();
}

// ----- Endpoint wrappers -----

export interface ListGuildsResult {
  ok: boolean;
  guilds?: APIGuild[];
  error?: string;
}

/**
 * List the guilds the bot is a member of via GET /users/@me/guilds.
 *
 * The `permissions` string on each guild is the bot's computed guild-level
 * permission bitfield (admins get all bits set).
 */
export async function listGuilds(token: string): Promise<ListGuildsResult> {
  return cached(token, ["guilds"], async () => {
    try {
      const guilds = (await makeRest(token).get(
        Routes.userGuilds(),
      )) as RESTGetAPICurrentUserGuildsResult;
      return { ok: true, guilds: guilds as unknown as APIGuild[] };
    } catch (error) {
      return { ok: false, error: formatError(error) };
    }
  });
}

export interface ListGuildChannelsResult {
  ok: boolean;
  channels?: APIGuildChannel<ChannelType>[];
  error?: string;
}

/**
 * List all channels in a guild via GET /guilds/{id}/channels. Includes
 * permission_overwrites which we need for the postable-ness check.
 */
export async function listGuildChannels(
  guildId: string,
  token: string,
): Promise<ListGuildChannelsResult> {
  return cached(token, ["guild", guildId, "channels"], async () => {
    try {
      const channels = (await makeRest(token).get(
        Routes.guildChannels(guildId),
      )) as RESTGetAPIGuildChannelsResult;
      return { ok: true, channels };
    } catch (error) {
      return { ok: false, error: formatError(error) };
    }
  });
}

export interface GetBotMemberResult {
  ok: boolean;
  member?: APIGuildMember;
  error?: string;
}

/**
 * Get the bot's member object in a guild. Used to compute its roles for the
 * channel permission calculation.
 *
 * Note: Discord supports GET /guilds/{guild.id}/members/@me but the
 * @discordjs/rest Routes helper requires an explicit user id. "@me" works on
 * the URL just fine, so we pass it through.
 */
export async function getBotMember(
  guildId: string,
  token: string,
): Promise<GetBotMemberResult> {
  return cached(token, ["guild", guildId, "me"], async () => {
    try {
      const member = (await makeRest(token).get(
        Routes.guildMember(guildId, "@me"),
      )) as RESTGetAPIGuildMemberResult;
      return { ok: true, member };
    } catch (error) {
      return { ok: false, error: formatError(error) };
    }
  });
}

export interface GetGuildRolesResult {
  ok: boolean;
  roles?: APIRole[];
  error?: string;
}

export async function getGuildRoles(
  guildId: string,
  token: string,
): Promise<GetGuildRolesResult> {
  return cached(token, ["guild", guildId, "roles"], async () => {
    try {
      const roles = (await makeRest(token).get(
        Routes.guildRoles(guildId),
      )) as RESTGetAPIGuildRolesResult;
      return { ok: true, roles };
    } catch (error) {
      return { ok: false, error: formatError(error) };
    }
  });
}

// =============================================================================
// Permission math
// =============================================================================

export interface BotChannelPermissions {
  canView: boolean;
  canSend: boolean;
  isAdmin: boolean;
}

/**
 * Compute whether the bot has VIEW_CHANNEL + SEND_MESSAGES in a given channel.
 *
 * Algorithm follows
 * https://discord.com/developers/docs/topics/permissions#permission-overwrites
 *
 * 1. Start with base permissions = OR of bot's role permissions (including @everyone).
 * 2. If ADMINISTRATOR bit is set, return all (can do anything).
 * 3. Apply @everyone channel overwrite (deny then allow).
 * 4. Apply role overwrites (accumulate deny, accumulate allow, then apply).
 * 5. Apply member-specific overwrite for the bot (deny then allow).
 *
 * We do this by hand against raw API responses rather than using discord.js's
 * PermissionsBitField.resolve, because the discord.js helper expects you to
 * construct full GuildMember/Role/Channel client objects which we don't have
 * in this REST-only setup.
 */
export function computeBotChannelPermissions(
  channel: Pick<APIGuildChannel<ChannelType>, "permission_overwrites">,
  guildRoles: APIRole[],
  botMember: Pick<APIGuildMember, "roles" | "user">,
  guildId: string,
): BotChannelPermissions {
  const roleById = new Map<string, APIRole>();
  for (const role of guildRoles) roleById.set(role.id, role);

  // @everyone role's id is always the guild id
  const everyoneRole = roleById.get(guildId);
  let basePermissions = everyoneRole ? BigInt(everyoneRole.permissions) : 0n;

  for (const roleId of botMember.roles) {
    const role = roleById.get(roleId);
    if (role) basePermissions |= BigInt(role.permissions);
  }

  if ((basePermissions & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator) {
    return { canView: true, canSend: true, isAdmin: true };
  }

  let permissions = basePermissions;
  const overwrites: APIOverwrite[] = channel.permission_overwrites ?? [];

  // 3. @everyone overwrite
  const everyoneOverwrite = overwrites.find((o) => o.id === guildId);
  if (everyoneOverwrite) {
    permissions &= ~BigInt(everyoneOverwrite.deny);
    permissions |= BigInt(everyoneOverwrite.allow);
  }

  // 4. Role overwrites (accumulate)
  let allow = 0n;
  let deny = 0n;
  for (const roleId of botMember.roles) {
    const ow = overwrites.find((o) => o.type === OverwriteType.Role && o.id === roleId);
    if (ow) {
      allow |= BigInt(ow.allow);
      deny |= BigInt(ow.deny);
    }
  }
  permissions &= ~deny;
  permissions |= allow;

  // 5. Member-specific overwrite for the bot
  const botUserId = botMember.user?.id;
  if (botUserId) {
    const memberOverwrite = overwrites.find(
      (o) => o.type === OverwriteType.Member && o.id === botUserId,
    );
    if (memberOverwrite) {
      permissions &= ~BigInt(memberOverwrite.deny);
      permissions |= BigInt(memberOverwrite.allow);
    }
  }

  const canView =
    (permissions & PermissionFlagsBits.ViewChannel) === PermissionFlagsBits.ViewChannel;
  // Discord implicitly denies SEND_MESSAGES when VIEW_CHANNEL is denied.
  const canSend =
    canView &&
    (permissions & PermissionFlagsBits.SendMessages) === PermissionFlagsBits.SendMessages;

  return { canView, canSend, isAdmin: false };
}

// =============================================================================
// High-level helper: list postable channels for the picker UI
// =============================================================================

export interface PostableChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parentId: string | null;
  canSend: boolean;
  reason?: string;
}

export interface ListPostableChannelsResult {
  ok: boolean;
  channels?: PostableChannel[];
  error?: string;
}

/**
 * For a given guild, return the text-capable channels with computed
 * permissions. Non-text types are excluded entirely; channels the bot can't
 * send to are still returned with canSend=false so the UI can show them as
 * disabled.
 */
export async function listPostableChannels(
  guildId: string,
  token: string,
): Promise<ListPostableChannelsResult> {
  const [channelsRes, rolesRes, memberRes, guildsRes] = await Promise.all([
    listGuildChannels(guildId, token),
    getGuildRoles(guildId, token),
    getBotMember(guildId, token),
    listGuilds(token),
  ]);

  if (!channelsRes.ok || !channelsRes.channels) {
    return { ok: false, error: channelsRes.error || "Failed to list channels" };
  }

  const guild = guildsRes.guilds?.find((g) => g.id === guildId);
  const guildPerms = guild ? BigInt(guild.permissions ?? "0") : 0n;
  const guildIsAdmin =
    (guildPerms & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator;

  // Helper to coerce APIChannel into a uniform PostableChannel shape.
  const toPostable = (
    c: APIGuildChannel<ChannelType>,
    canSend: boolean,
    reason?: string,
  ): PostableChannel => {
    // Categories don't have parent_id, threads do; text channels may.
    // We narrow via type before reading parent_id to satisfy TS.
    const parentId =
      "parent_id" in c && typeof (c as APIChannel & { parent_id?: string }).parent_id === "string"
        ? ((c as APIChannel & { parent_id?: string }).parent_id ?? null)
        : null;
    return {
      id: c.id,
      name: c.name ?? "",
      type: c.type,
      position: c.position ?? 0,
      parentId,
      canSend,
      reason,
    };
  };

  // Fast path: if guild-level perms include ADMINISTRATOR, every text channel
  // is sendable. We still skip non-text types.
  if (guildIsAdmin) {
    const channels = channelsRes.channels
      .filter((c) => TEXT_CHANNEL_TYPES.has(c.type))
      .map((c) => toPostable(c, true))
      .sort((a, b) => a.position - b.position);
    return { ok: true, channels };
  }

  if (!rolesRes.ok || !rolesRes.roles || !memberRes.ok || !memberRes.member) {
    return {
      ok: false,
      error: rolesRes.error || memberRes.error || "Failed to fetch roles or member",
    };
  }

  const channels = channelsRes.channels
    .filter((c) => TEXT_CHANNEL_TYPES.has(c.type))
    .map((c) => {
      const perms = computeBotChannelPermissions(c, rolesRes.roles!, memberRes.member!, guildId);
      const reason = perms.canSend
        ? undefined
        : !perms.canView
          ? "Bot can't view this channel"
          : "Bot lacks SEND_MESSAGES";
      return toPostable(c, perms.canSend, reason);
    })
    .sort((a, b) => a.position - b.position);

  return { ok: true, channels };
}
