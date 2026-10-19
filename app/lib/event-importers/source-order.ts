export function orderEventSourcesForSync<T extends { sourceType: string }>(sources: T[]): T[] {
  const luma = sources.filter((source) => source.sourceType.startsWith("luma-"));
  const other = sources.filter((source) => !source.sourceType.startsWith("luma-"));
  const ordered: T[] = [];
  for (let i = 0; i < Math.max(luma.length, other.length); i++) {
    if (luma[i]) ordered.push(luma[i]);
    if (other[i]) ordered.push(other[i]);
  }
  return ordered;
}
