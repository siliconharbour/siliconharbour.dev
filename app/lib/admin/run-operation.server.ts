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
