/**
 * Randomly selects a specified number of items from an array
 * @param array - The source array to select from
 * @param count - The number of items to select
 * @returns A new array with randomly selected items
 */
export function randomSelect<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
