import { ImageInputError } from "~/lib/image-input.server";
import { PublicFetchError } from "~/lib/public-fetch.server";
import { z } from "zod";
import { requireAdmin } from "~/lib/session.server";
import { adminContext } from "~/operations/context";
import {
  NotFoundError,
  ForbiddenError,
  InvalidOperationError,
  ConflictError,
  ConfirmationRequiredError,
} from "~/operations/errors";
import { formatValidationError } from "~/operations/fields";
import type { Operation } from "~/operations/define";

export async function runAdminOperation<O extends Operation>(
  request: Request,
  operation: O,
  input: unknown,
): Promise<{ ok: true; data: Awaited<ReturnType<O["execute"]>> } | { ok: false; error: string }> {
  const { user } = await requireAdmin(request);
  try {
    const data = await operation.execute(adminContext(user.id), input);
    return { ok: true, data: data as Awaited<ReturnType<O["execute"]>> };
  } catch (error) {
    if (error instanceof NotFoundError) throw new Response(error.message, { status: 404 });
    if (error instanceof ForbiddenError) throw new Response(error.message, { status: 403 });
    if (error instanceof z.ZodError)
      return { ok: false, error: formatValidationError(error, operation.input) };
    if (
      error instanceof ImageInputError ||
      error instanceof PublicFetchError ||
      error instanceof InvalidOperationError ||
      error instanceof ConflictError ||
      error instanceof ConfirmationRequiredError
    )
      return { ok: false, error: error.message };
    throw error;
  }
}

export async function loadAdminOperation<O extends Operation>(
  request: Request,
  operation: O,
  input: unknown,
): Promise<Awaited<ReturnType<O["execute"]>>> {
  if (operation.risk !== "read") throw new Error(`${operation.name} is not a read operation`);
  const result = await runAdminOperation(request, operation, input);
  if (!result.ok) throw new Response(result.error, { status: 400 });
  return result.data;
}
type PagedOperation<T> = Omit<Operation, "execute"> & {
  execute(
    context: import("~/operations/context").OperationContext,
    input: unknown,
  ): Promise<{ items: T[]; nextOffset: number | null }>;
};
export async function loadAllAdminItems<T>(
  request: Request,
  operation: PagedOperation<T>,
  input: Record<string, unknown> = {},
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await loadAdminOperation(request, operation, { ...input, limit: 200, offset });
    items.push(...page.items);
    if (page.nextOffset === null) return items;
    if (page.nextOffset <= offset) throw new Error(`${operation.name} did not advance pagination`);
    offset = page.nextOffset;
  }
}
