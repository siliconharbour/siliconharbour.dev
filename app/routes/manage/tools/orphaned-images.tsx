import type { Route } from "./+types/orphaned-images";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import {
  deleteAllStagedOrphans,
  deleteStagedOrphan,
  getOrphanedImagesState,
  stageOrphanedImagesBatch,
} from "~/lib/image-orphans.server";
import { requireAuth } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Orphaned Images - siliconharbour.dev" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  return getOrphanedImagesState({ page });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "scan");

  if (intent === "delete") {
    const path = String(formData.get("path") || "");
    if (!path) return { intent, success: false as const, error: "Image path is required." };
    try {
      return {
        intent,
        success: true as const,
        error: null,
        deleteResult: deleteStagedOrphan(path),
      };
    } catch (error) {
      return {
        intent,
        success: false as const,
        error: error instanceof Error ? error.message : "Failed to delete the image.",
      };
    }
  }

  if (intent === "delete-all") {
    try {
      return {
        intent,
        success: true as const,
        error: null,
        deleteResult: deleteAllStagedOrphans(),
      };
    } catch (error) {
      return {
        intent,
        success: false as const,
        error: error instanceof Error ? error.message : "Failed to delete staged images.",
      };
    }
  }

  const parsedBatchSize = Number(formData.get("batchSize") || 250);
  const batchSize = Number.isFinite(parsedBatchSize)
    ? Math.min(Math.max(Math.floor(parsedBatchSize), 1), 5000)
    : 250;

  try {
    const result = await stageOrphanedImagesBatch({
      batchSize,
      useCursor: true,
      resetCursor: formData.get("resetCursor") === "true",
      dryRun: false,
    });
    return { intent: "scan", success: true as const, error: null, result };
  } catch (error) {
    return {
      intent: "scan",
      success: false as const,
      error: error instanceof Error ? error.message : "Failed to scan images.",
      result: null,
    };
  }
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
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-harbour-700">Orphaned Images</h1>
            <p className="mt-1 text-sm text-harbour-500">
              Find image files that are not referenced by any text field in the database.
            </p>
          </div>
          <Link to="/manage" className="text-sm text-harbour-400 hover:text-harbour-600">
            &larr; Back to Dashboard
          </Link>
        </div>

        <div className="border border-harbour-200 bg-harbour-50 p-4 text-sm text-harbour-600">
          Staging builds a review list without moving files. Deletion re-checks the current database
          first and preserves any image that has become referenced since it was staged.
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="border border-harbour-200 bg-white p-3">
            <p className="text-xs text-harbour-400">Scan progress</p>
            <p className="mt-1 font-medium text-harbour-700">
              {scanned.toLocaleString()} / {totalImages.toLocaleString()} ({progress}%)
            </p>
          </div>
          <div className="border border-harbour-200 bg-white p-3">
            <p className="text-xs text-harbour-400">Staged candidates</p>
            <p className="mt-1 font-medium text-harbour-700">
              {state.stagedTotal.toLocaleString()} · {formatBytes(state.stagedBytes)}
            </p>
          </div>
          <div className="border border-harbour-200 bg-white p-3">
            <p className="text-xs text-harbour-400">Scan reports</p>
            <p className="mt-1 font-medium text-harbour-700">{state.reportCount}</p>
          </div>
        </div>

        <div className="border border-harbour-200 bg-white p-4">
          <Form method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="scan" />
            <label className="flex flex-col gap-1 text-xs text-harbour-500">
              Batch size
              <input
                type="number"
                name="batchSize"
                defaultValue={250}
                min={1}
                max={5000}
                className="w-28 border border-harbour-200 px-2 py-1.5 text-sm text-harbour-700"
              />
            </label>
            <button
              type="submit"
              disabled={isScanning}
              className="border border-harbour-600 bg-harbour-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-harbour-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isScanning ? "Scanning…" : "Scan Next Batch"}
            </button>
            <button
              type="submit"
              name="resetCursor"
              value="true"
              disabled={isScanning}
              className="border border-harbour-200 bg-harbour-100 px-3 py-1.5 text-sm text-harbour-700 hover:bg-harbour-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Restart from Beginning
            </button>
          </Form>

          {actionData?.error && (
            <p className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionData.error}
            </p>
          )}
          {actionData?.success && "result" in actionData && actionData.result && (
            <p className="mt-3 border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              Scanned {actionData.result.scannedCount} images and found {actionData.result.orphanCount}{" "}
              candidates ({actionData.result.newlyStagedCount} newly staged).
            </p>
          )}
          {actionData?.success && "deleteResult" in actionData && actionData.deleteResult && (
            <p className="mt-3 border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              Deleted {actionData.deleteResult.deletedCount} files. Skipped{" "}
              {actionData.deleteResult.referencedCount} now-referenced files
              {actionData.deleteResult.missingCount > 0
                ? `; removed ${actionData.deleteResult.missingCount} missing files from the list`
                : ""}
              .
            </p>
          )}
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-harbour-700">Staged Candidates</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-harbour-400">{state.stagedTotal} total</span>
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
                    className="border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete All Staged
                  </button>
                </Form>
              )}
            </div>
          </div>

          {state.items.length === 0 ? (
            <div className="border border-harbour-200 bg-white p-10 text-center text-harbour-400">
              No orphaned images have been staged.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {state.items.map((item) => (
                <article key={item.path} className="min-w-0 border border-harbour-200 bg-white p-2">
                  <a href={`/images/${encodeURIComponent(item.path)}`} target="_blank" rel="noreferrer">
                    <img
                      src={`/images/${encodeURIComponent(item.path)}`}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full bg-harbour-50 object-contain"
                    />
                  </a>
                  <p className="mt-2 truncate text-xs text-harbour-600" title={item.path}>
                    {item.filename}
                  </p>
                  <p className="text-xs text-harbour-400">{formatBytes(item.sizeBytes)}</p>
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
                      className="w-full border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </Form>
                </article>
              ))}
            </div>
          )}

          {state.totalPages > 1 && (
            <nav className="flex items-center justify-center gap-3 text-sm">
              {state.page > 1 ? (
                <Link
                  to={`?page=${state.page - 1}`}
                  className="border border-harbour-200 bg-white px-3 py-1.5 text-harbour-600 hover:bg-harbour-50"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-harbour-400">
                Page {state.page} of {state.totalPages}
              </span>
              {state.page < state.totalPages ? (
                <Link
                  to={`?page=${state.page + 1}`}
                  className="border border-harbour-200 bg-white px-3 py-1.5 text-harbour-600 hover:bg-harbour-50"
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
