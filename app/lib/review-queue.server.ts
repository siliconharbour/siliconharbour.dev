import { rawDb } from "~/db";
import { getEventById } from "./events.server";
import { getJobById } from "./jobs.server";
import { getNewsById } from "./news.server";
import { pageResult, type ListInput } from "~/operations/listing";
import { NotFoundError } from "~/operations/errors";

const pending = `SELECT 'event' AS type, id, title, created_at FROM events WHERE import_status = 'pending_review'
UNION ALL SELECT 'job' AS type, id, title, created_at FROM jobs WHERE status = 'pending_review'
UNION ALL SELECT 'news' AS type, id, title, created_at FROM news WHERE status = 'pending_review'`;
export async function listReviewQueue(input: ListInput) {
  const query = input.query?.toLowerCase() ?? "";
  const where = "(? = '' OR instr(lower(title), ?) > 0)";
  const sort = input.sort === "title" ? "title" : "created_at";
  const { total } = rawDb
    .prepare(`SELECT count(*) AS total FROM (${pending}) WHERE ${where}`)
    .get(query, query) as { total: number };
  const rows = rawDb
    .prepare(
      `SELECT type,id FROM (${pending}) WHERE ${where} ORDER BY ${sort} ${input.order === "asc" ? "ASC" : "DESC"}, type, id LIMIT ? OFFSET ?`,
    )
    .all(query, query, input.limit, input.offset) as Array<{
    type: "event" | "job" | "news";
    id: number;
  }>;
  const items = await Promise.all(
    rows.map(async (row) => {
      if (row.type === "event") {
        const record = await getEventById(row.id);
        if (!record) throw new NotFoundError("Review event no longer exists");
        return { type: "event" as const, record };
      }
      if (row.type === "job") {
        const record = await getJobById(row.id);
        if (!record) throw new NotFoundError("Review job no longer exists");
        return { type: "job" as const, record };
      }
      const record = await getNewsById(row.id);
      if (!record) throw new NotFoundError("Review news no longer exists");
      return { type: "news" as const, record };
    }),
  );
  return pageResult(input, items, total);
}
