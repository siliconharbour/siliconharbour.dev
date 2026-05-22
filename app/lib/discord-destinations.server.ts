import { db } from "~/db";
import {
  discordDestinations,
  type DiscordChannelType,
  type DiscordDestination,
} from "~/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * List configured destinations for a channel type, ordered by guild name then channel name.
 */
export async function listDestinations(
  type: DiscordChannelType,
): Promise<DiscordDestination[]> {
  const rows = await db
    .select()
    .from(discordDestinations)
    .where(eq(discordDestinations.channelType, type));

  return rows.sort((a, b) => {
    const g = a.guildName.localeCompare(b.guildName);
    if (g !== 0) return g;
    return a.channelName.localeCompare(b.channelName);
  });
}

/**
 * List all destinations across all channel types.
 */
export async function listAllDestinations(): Promise<DiscordDestination[]> {
  return db.select().from(discordDestinations).all();
}

/**
 * Add a destination. Unique on (channelType, channelId); does nothing on conflict.
 * Returns the inserted-or-existing row, or null if the lookup somehow fails.
 */
export async function addDestination(params: {
  type: DiscordChannelType;
  guildId: string;
  guildName: string;
  channelId: string;
  channelName: string;
}): Promise<DiscordDestination | null> {
  await db
    .insert(discordDestinations)
    .values({
      channelType: params.type,
      guildId: params.guildId,
      guildName: params.guildName,
      channelId: params.channelId,
      channelName: params.channelName,
    })
    .onConflictDoUpdate({
      target: [discordDestinations.channelType, discordDestinations.channelId],
      // Refresh the display names in case they've changed since last save.
      set: { guildName: params.guildName, channelName: params.channelName },
    });

  const existing = await db
    .select()
    .from(discordDestinations)
    .where(
      and(
        eq(discordDestinations.channelType, params.type),
        eq(discordDestinations.channelId, params.channelId),
      ),
    )
    .get();
  return existing ?? null;
}

/**
 * Remove a destination by id.
 */
export async function removeDestination(id: number): Promise<void> {
  await db.delete(discordDestinations).where(eq(discordDestinations.id, id));
}
