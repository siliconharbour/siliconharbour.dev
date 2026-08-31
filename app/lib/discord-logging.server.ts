export type DiscordLogLevel = "info" | "warn" | "error";

/**
 * Write one-line JSON logs for Discord operations so Docker logs can be
 * searched and correlated without exposing message contents or credentials.
 */
export function logDiscord(
  level: DiscordLogLevel,
  event: string,
  details: Record<string, unknown> = {},
): void {
  const entry = JSON.stringify({
    ...details,
    timestamp: new Date().toISOString(),
    level,
    scope: "discord",
    event,
  });

  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.info(entry);
  }
}

/** Extract safe, useful fields without serializing request bodies or tokens. */
export function discordErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { errorMessage: String(error) };
  }

  const details: Record<string, unknown> = {
    errorName: error.name,
    errorMessage: error.message,
  };
  const errorRecord = error as unknown as Record<string, unknown>;

  if (typeof errorRecord.status === "number") details.httpStatus = errorRecord.status;
  if (typeof errorRecord.code === "number" || typeof errorRecord.code === "string") {
    details.discordCode = errorRecord.code;
  }

  return details;
}
