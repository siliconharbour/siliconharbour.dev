import { operationCatalog } from "~/operations/catalog";
import { runAdminOperation } from "~/lib/admin/run-operation.server";

import type { Route } from "./+types/orphaned-images";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { getOrphanedImagesState } from "~/lib/image-orphans.server";
import { requireAdmin } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Orphaned Images - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  return getOrphanedImagesState({ page });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent") || "scan";
  if (intent === "delete" || intent === "delete-all") {
    const operation =
      intent === "delete"
        ? operationCatalog.imageOrphanDelete
        : operationCatalog.imageOrphansDeleteAll;
    const result = await runAdminOperation(request, operation, {
      ...(intent === "delete" && { path: form.get("path") }),
      confirm: true,
    });
    return result.ok
      ? ({ intent, success: true, error: null, deleteResult: result.data } as const)
      : ({ intent, success: false, error: result.error } as const);
  }
  const result = await runAdminOperation(request, operationCatalog.imageOrphansStage, {
    batchSize: Number(form.get("batchSize") || 250),
    resetCursor: form.get("resetCursor") === "true",
  });
  return result.ok
    ? ({ intent: "scan", success: true, error: null, result: result.data } as const)
    : ({ intent: "scan", success: false, error: result.error, result: null } as const);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OrphanedImages() {
  const state = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isScanning = navigation.state === "submitting";
  const scanned = state.cursor?.nextOffset ?? 0;
  const totalImages = state.cursor?.totalImagesLastRun ?? 0;
  const progress = totalImages > 0 ? Math.min(100, Math.round((scanned / totalImages) * 100)) : 0;

  return (
    <div className="min-h-screen p-pad-4 md:p-pad-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-gap-6">
        <div className="flex flex-wrap items-start justify-between gap-gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-heading">Orphaned Images</h1>
            <p className="mt-1 text-sm text-muted">
              Find image files that are not referenced by any text field in the database.
            </p>
          </div>
          <Link to="/manage" className="text-sm text-subtle hover:text-body">
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="border border-line bg-soft p-pad-4 text-sm text-body">
          Staging builds a review list without moving files. Deletion re-checks the current database
          first and preserves any image that has become referenced since it was staged.
        </div>

        <div className="grid gap-gap-3 sm:grid-cols-3">
          <div className="border border-line bg-surface p-pad-3 rounded-panel">
            <p className="text-xs text-subtle">Scan progress</p>
            <p className="mt-1 font-medium text-heading">
              {scanned.toLocaleString()} / {totalImages.toLocaleString()} ({progress}%)
            </p>
          </div>
          <div className="border border-line bg-surface p-pad-3 rounded-panel">
            <p className="text-xs text-subtle">Staged candidates</p>
            <p className="mt-1 font-medium text-heading">
              {state.stagedTotal.toLocaleString()} · {formatBytes(state.stagedBytes)}
            </p>
          </div>
          <div className="border border-line bg-surface p-pad-3 rounded-panel">
            <p className="text-xs text-subtle">Scan reports</p>
            <p className="mt-1 font-medium text-heading">{state.reportCount}</p>
          </div>
        </div>

        <div className="border border-line bg-surface p-pad-4 rounded-panel">
          <Form method="post" className="flex flex-wrap items-end gap-gap-3">
            <input type="hidden" name="intent" value="scan" />
            <label className="flex flex-col gap-gap-1 text-xs text-muted">
              Batch size
              <input
                type="number"
                name="batchSize"
                defaultValue={250}
                min={1}
                max={5000}
                className="w-28 border border-line px-pad-2 py-pad-1-5 text-sm text-heading"
              />
            </label>
            <button
              type="submit"
              disabled={isScanning}
              className="border border-harbour-600 bg-primary px-pad-3 py-pad-1-5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isScanning ? "Scanning…" : "Scan Next Batch"}
            </button>
            <button
              type="submit"
              name="resetCursor"
              value="true"
              disabled={isScanning}
              className="border border-line bg-tint px-pad-3 py-pad-1-5 text-sm text-heading hover:bg-harbour-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Restart from Beginning
            </button>
          </Form>

          {actionData?.error && (
            <p className="mt-3 border border-red-200 bg-red-50 px-pad-3 py-pad-2 text-sm text-red-700">
              {actionData.error}
            </p>
          )}
          {actionData?.success && "result" in actionData && actionData.result && (
            <p className="mt-3 border border-green-200 bg-green-50 px-pad-3 py-pad-2 text-sm text-green-700">
              Scanned {actionData.result.scannedCount} images and found{" "}
              {actionData.result.orphanCount} candidates ({actionData.result.newlyStagedCount} newly
              staged).
            </p>
          )}
          {actionData?.success && "deleteResult" in actionData && actionData.deleteResult && (
            <p className="mt-3 border border-green-200 bg-green-50 px-pad-3 py-pad-2 text-sm text-green-700">
              Deleted {actionData.deleteResult.deletedCount} files. Skipped{" "}
              {actionData.deleteResult.referencedCount} now-referenced files
              {actionData.deleteResult.missingCount > 0
                ? `; removed ${actionData.deleteResult.missingCount} missing files from the list`
                : ""}
              {actionData.deleteResult.failedCount > 0
                ? `; ${actionData.deleteResult.failedCount} filesystem operations failed and remain staged`
                : ""}
              .
            </p>
          )}
        </div>

        <section className="flex flex-col gap-gap-3">
          <div className="flex items-baseline justify-between gap-gap-3">
            <h2 className="text-lg font-semibold text-heading">Staged Candidates</h2>
            <div className="flex items-center gap-gap-3">
              <span className="text-sm text-subtle">{state.stagedTotal} total</span>
              {state.stagedTotal > 0 && (
                <Form
                  method="post"
                  onSubmit={(event) => {
                    if (
                      !confirm(
                        `Permanently delete all ${state.stagedTotal} staged candidates? Each will be re-checked first.`,
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="delete-all" />
                  <button
                    type="submit"
                    disabled={isScanning}
                    className="border border-red-200 px-pad-2 py-pad-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete All Staged
                  </button>
                </Form>
              )}
            </div>
          </div>

          {state.items.length === 0 ? (
            <div className="border border-line bg-surface p-pad-10 text-center text-subtle rounded-panel">
              No orphaned images have been staged.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {state.items.map((item) => (
                <article
                  key={item.path}
                  className="min-w-0 border border-line bg-surface p-pad-2 rounded-panel"
                >
                  <a
                    href={`/images/${encodeURIComponent(item.path)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={`/images/${encodeURIComponent(item.path)}`}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full bg-soft object-contain"
                    />
                  </a>
                  <p className="mt-2 truncate text-xs text-body" title={item.path}>
                    {item.filename}
                  </p>
                  <p className="text-xs text-subtle">{formatBytes(item.sizeBytes)}</p>
                  <Form
                    method="post"
                    className="mt-2"
                    onSubmit={(event) => {
                      if (!confirm(`Permanently delete ${item.filename}?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="path" value={item.path} />
                    <button
                      type="submit"
                      disabled={isScanning}
                      className="w-full border border-red-200 px-pad-2 py-pad-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </Form>
                </article>
              ))}
            </div>
          )}

          {state.totalPages > 1 && (
            <nav className="flex items-center justify-center gap-gap-3 text-sm">
              {state.page > 1 ? (
                <Link
                  to={`?page=${state.page - 1}`}
                  className="border border-line bg-surface px-pad-3 py-pad-1-5 text-body hover:bg-soft"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-subtle">
                Page {state.page} of {state.totalPages}
              </span>
              {state.page < state.totalPages ? (
                <Link
                  to={`?page=${state.page + 1}`}
                  className="border border-line bg-surface px-pad-3 py-pad-1-5 text-body hover:bg-soft"
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
