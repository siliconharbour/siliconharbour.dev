export function closestNames(query: string, names: readonly string[]): string[] {
  const needle = query.split(".").at(-1)!.toLowerCase();
  if (!needle || needle.length > 100) return [];
  function distance(left: string, right: string): number {
    const rows = Array.from({ length: left.length + 1 }, (_, i) =>
      Array.from({ length: right.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= left.length; i++) {
      for (let j = 1; j <= right.length; j++) {
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
        );
        if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1])
          rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
    return rows[left.length][right.length];
  }
  return names
    .map((name) => ({ name, distance: distance(needle, name.toLowerCase()) }))
    .filter((item) => item.distance <= Math.max(2, Math.floor(needle.length * 0.35)))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((item) => item.name);
}
