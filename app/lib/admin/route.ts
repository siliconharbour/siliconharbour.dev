export function parseIdOrThrow(rawValue: string | undefined, entityLabel = "item"): number {
  const id = Number.parseInt(rawValue ?? "", 10);
  if (Number.isNaN(id)) {
    throw new Response(`Invalid ${entityLabel} ID`, { status: 400 });
  }
  return id;
}
