const DISCORD_API_BASE = "https://discord.com/api/v10";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
}

export interface VerifyResult {
  valid: boolean;
  username?: string;
  userId?: string;
  error?: string;
}

/**
 * Verify a Discord bot token by calling GET /users/@me
 */
export async function verifyBotToken(token: string): Promise<VerifyResult> {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { Authorization: `Bot ${token}` },
    });

    if (!response.ok) {
      return { valid: false, error: `HTTP ${response.status}` };
    }

    const user: DiscordUser = await response.json();
    return { valid: true, username: user.username, userId: user.id };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface PostMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Post a Components v2 message to a Discord channel.
 *
 * The payload should be the `components` array. This function wraps it
 * with the IS_COMPONENTS_V2 flag (1 << 15 = 32768).
 */
export async function postMessage(
  channelId: string,
  components: object[],
  token: string,
): Promise<PostMessageResult> {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flags: 1 << 15,
        components,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `Discord API error ${response.status}: ${errorBody}`,
      };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// =============================================================================
// Guilds + channels + permissions
// =============================================================================

// Permission bit constants. See:
// https://discord.com/developers/docs/topics/permissions
export const PERMISSION_BITS = {
  ADMINISTRATOR: 1n << 3n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
} as const;

// Channel types we'll accept as text destinations.
// https://discord.com/developers/docs/resources/channel#channel-object-channel-types
export const TEXT_CHANNEL_TYPES = new Set([
  0, // GUILD_TEXT
  5, // GUILD_ANNOUNCEMENT
]);

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  /** The bot's permissions in the guild (stringified bitfield) */
  permissions: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
  parent_id: string | null;
  permission_overwrites?: DiscordPermissionOverwrite[];
}

export interface DiscordPermissionOverwrite {
  id: string;
  /** 0 = role, 1 = member */
  type: 0 | 1;
  allow: string;
  deny: string;
}

export interface DiscordRole {
  id: string;
  name: string;
  permissions: string;
  position: number;
}

export interface DiscordGuildMember {
  user?: { id: string };
  roles: string[];
}

// ----- in-memory cache (per-process) -----
// Keyed on token + endpoint key. Small TTL so the settings page stays snappy
// without making us beg the Discord rate limiter on every render.

interface CacheEntry<T> {
  expires: number;
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60_000;

function cacheKey(token: string, parts: string[]): string {
  // Hash-ish: take last 8 chars of token to avoid logging it; collisions are
  // fine because we'd only mix entries between two bots sharing a process.
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

// ----- REST helpers -----

async function discordGet<T>(
  path: string,
  token: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const response = await fetch(`${DISCORD_API_BASE}${path}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: body || response.statusText, status: response.status };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
      status: 0,
    };
  }
}

export interface ListGuildsResult {
  ok: boolean;
  guilds?: DiscordGuild[];
  error?: string;
}

/**
 * List the guilds the bot is a member of.
 *
 * Uses GET /users/@me/guilds. `permissions` on each guild is the bot's
 * computed guild-level permission bitfield (admins get all bits).
 */
export async function listGuilds(token: string): Promise<ListGuildsResult> {
  return cached(token, ["guilds"], async () => {
    const res = await discordGet<DiscordGuild[]>("/users/@me/guilds", token);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, guilds: res.data };
  });
}

export interface ListGuildChannelsResult {
  ok: boolean;
  channels?: DiscordChannel[];
  error?: string;
}

/**
 * List all channels in a guild. Includes permission_overwrites which we need
 * for the postable-ness check.
 */
export async function listGuildChannels(
  guildId: string,
  token: string,
): Promise<ListGuildChannelsResult> {
  return cached(token, ["guild", guildId, "channels"], async () => {
    const res = await discordGet<DiscordChannel[]>(`/guilds/${guildId}/channels`, token);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, channels: res.data };
  });
}

export interface GetBotMemberResult {
  ok: boolean;
  member?: DiscordGuildMember;
  error?: string;
}

/**
 * Get the bot's member object in a guild. Used to compute its roles for the
 * channel permission calculation.
 */
export async function getBotMember(
  guildId: string,
  token: string,
): Promise<GetBotMemberResult> {
  return cached(token, ["guild", guildId, "me"], async () => {
    const res = await discordGet<DiscordGuildMember>(`/guilds/${guildId}/members/@me`, token);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, member: res.data };
  });
}

export interface GetGuildRolesResult {
  ok: boolean;
  roles?: DiscordRole[];
  error?: string;
}

/**
 * Get all roles in a guild.
 */
export async function getGuildRoles(
  guildId: string,
  token: string,
): Promise<GetGuildRolesResult> {
  return cached(token, ["guild", guildId, "roles"], async () => {
    const res = await discordGet<DiscordRole[]>(`/guilds/${guildId}/roles`, token);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, roles: res.data };
  });
}

// ----- Permission math -----

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
 */
export function computeBotChannelPermissions(
  channel: Pick<DiscordChannel, "permission_overwrites">,
  guildRoles: DiscordRole[],
  botMember: Pick<DiscordGuildMember, "roles" | "user">,
  guildId: string,
): BotChannelPermissions {
  // Map of role id -> bigint permissions
  const roleById = new Map<string, DiscordRole>();
  for (const role of guildRoles) roleById.set(role.id, role);

  // @everyone role's id is always the guild id
  const everyoneRole = roleById.get(guildId);
  let basePermissions = everyoneRole ? BigInt(everyoneRole.permissions) : 0n;

  for (const roleId of botMember.roles) {
    const role = roleById.get(roleId);
    if (role) basePermissions |= BigInt(role.permissions);
  }

  if ((basePermissions & PERMISSION_BITS.ADMINISTRATOR) === PERMISSION_BITS.ADMINISTRATOR) {
    return { canView: true, canSend: true, isAdmin: true };
  }

  let permissions = basePermissions;
  const overwrites = channel.permission_overwrites ?? [];

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
    const ow = overwrites.find((o) => o.type === 0 && o.id === roleId);
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
    const memberOverwrite = overwrites.find((o) => o.type === 1 && o.id === botUserId);
    if (memberOverwrite) {
      permissions &= ~BigInt(memberOverwrite.deny);
      permissions |= BigInt(memberOverwrite.allow);
    }
  }

  const canView = (permissions & PERMISSION_BITS.VIEW_CHANNEL) === PERMISSION_BITS.VIEW_CHANNEL;
  // Discord implicitly denies SEND_MESSAGES when VIEW_CHANNEL is denied.
  const canSend =
    canView && (permissions & PERMISSION_BITS.SEND_MESSAGES) === PERMISSION_BITS.SEND_MESSAGES;

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
 * For a given guild, return the text-capable channels with computed permissions.
 * Non-text types are excluded entirely; channels the bot can't send to are
 * still returned with canSend=false so the UI can show them as disabled.
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
  const guildPerms = guild ? BigInt(guild.permissions) : 0n;
  const guildIsAdmin =
    (guildPerms & PERMISSION_BITS.ADMINISTRATOR) === PERMISSION_BITS.ADMINISTRATOR;

  // Fast path: if guild-level perms include ADMINISTRATOR, every channel is sendable.
  // We still skip non-text types.
  if (guildIsAdmin) {
    const channels = channelsRes.channels
      .filter((c) => TEXT_CHANNEL_TYPES.has(c.type))
      .map<PostableChannel>((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        parentId: c.parent_id,
        canSend: true,
      }))
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
    .map<PostableChannel>((c) => {
      const perms = computeBotChannelPermissions(c, rolesRes.roles!, memberRes.member!, guildId);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        parentId: c.parent_id,
        canSend: perms.canSend,
        reason: perms.canSend
          ? undefined
          : !perms.canView
            ? "Bot can't view this channel"
            : "Bot lacks SEND_MESSAGES",
      };
    })
    .sort((a, b) => a.position - b.position);

  return { ok: true, channels };
}
