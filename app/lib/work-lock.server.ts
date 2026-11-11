import { ConflictError } from "~/operations/errors";

const work = new Map<string, Promise<void>>();

/** Controls wait for the current batch; duplicate execution requests fail instead of replaying. */
export async function withWorkLock<T>(
  key: string,
  run: () => Promise<T>,
  contention: "reject" | "wait" = "reject",
): Promise<T> {
  const previous = work.get(key);
  if (previous && contention === "reject") throw new ConflictError("Work is already in progress");
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  work.set(key, current);
  try {
    await previous;
    return await run();
  } finally {
    if (work.get(key) === current) work.delete(key);
    release();
  }
}
