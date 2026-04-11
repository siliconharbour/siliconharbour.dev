const DISCORD_API_BASE = "https://discord.com/api/v10";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
}

export interface VerifyResult {
  valid: boolean;
  username?: string;
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
    return { valid: true, username: user.username };
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
