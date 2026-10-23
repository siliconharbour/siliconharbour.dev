import { z } from "zod";

export const listFields = {
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  query: z.string().trim().max(500).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
};
export function listInput<const T extends readonly [string, ...string[]]>(
  sort: T,
  defaultSort: T[number] = sort[0],
) {
  return z.object({ ...listFields, sort: z.enum(sort).default(defaultSort) }).strict();
}
export function page<T extends z.ZodType>(item: T) {
  return z
    .object({
      items: z.array(item),
      total: z.number().int().nonnegative().describe("Exact matching count."),
      nextOffset: z.number().int().nonnegative().nullable(),
    })
    .strict();
}
export interface ListInput {
  limit: number;
  offset: number;
  query?: string;
  sort: string;
  order: "asc" | "desc";
}
export function pageResult<T>(input: Pick<ListInput, "offset">, items: T[], total: number) {
  const next = input.offset + items.length;
  return { items, total, nextOffset: items.length > 0 && next < total ? next : null };
}
export function collectionPage<T>(
  rows: readonly T[],
  input: ListInput,
  fields: { [sort: string]: (row: T) => string | number | Date | null | undefined },
) {
  const search = Object.values(fields);
  const matching = rows.filter(
    (row) =>
      !input.query ||
      search.some((field) =>
        String(field(row) ?? "")
          .toLowerCase()
          .includes(input.query!.toLowerCase()),
      ),
  );
  const key = fields[input.sort];
  if (!key) throw new Error(`Unsupported sort: ${input.sort}`);
  const value = (row: T) => {
    const item = key(row);
    return item instanceof Date ? item.getTime() : (item ?? "");
  };
  matching.sort((a, b) => {
    const left = value(a),
      right = value(b);
    return (
      (typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right))) * (input.order === "asc" ? 1 : -1)
    );
  });
  return pageResult(
    input,
    matching.slice(input.offset, input.offset + input.limit),
    matching.length,
  );
}
