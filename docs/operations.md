# Shared operations

`app/operations/catalog.ts` is the interface for admin actions and MCP. Operations own validation, authorization, and business rules; services in `app/lib` own database and external I/O. Routes translate forms and render results. `app/mcp/bridge.ts` only assembles catalog bindings.

## Calling operations

MCP exposes `search`, `query`, and, for administrators with `mcp:write`, `execute`. Functions use noun-first camelCase:

```js
return await tools.siliconharbour.eventOccurrenceCancel({
  id: 123,
  date: "2026-11-01",
});
```

Search by task (`cancel occurrence`, `blocklist`, `newsletter`) or by an exact operation name. Exact-name searches include the input JSON Schema. Runtime signatures include declared output shapes. Return only needed fields and paginate large results.

Public reads have explicit names such as `eventPublicList`, `jobPublicList`, and `companyPublicList`. Administrative reads such as `eventList`, `newsletterSubscriberList`, and `themeShareList` require an admin actor and the read scope, even though they do not mutate data. Anonymous callers never receive hidden records, subscriber details, moderation IPs, or configuration secrets.

Every operation enforces access itself. Admin sessions receive read/write scopes; MCP contexts use the authenticated actor and granted scopes. Every destructive or external operation requires `confirm: true`. JSON Schemas describe inputs and outputs; input validation runs on every call, while output contracts are checked in tests rather than introducing production output-validation failures.

## Behavior to preserve

- Unknown keys fail, including nested image, link, date, and evidence objects. Empty update patches fail with `No fields to update`. Required text rejects blanks; nullable text explicitly normalizes blanks to null.
- Events created remotely default to `pending_review`. Admin creation explicitly selects public visibility. Only null or `published` import status is public; approving an imported event does not publish it.
- Supplying event dates clears recurrence fields. Supplying a recurrence rule clears dates. Do not supply both. All-day dates anchor to noon in `America/St_Johns`. Stored occurrence overrides survive schedule changes and are ignored while the event is one-time.
- News publication sets a missing `publishedAt` from the operation clock. Hiding preserves it; an explicit date or null wins. Link submission fetches metadata and publishes immediately.
- Person social links and project links are objects or null in every response. Updates merge supplied keys atomically: omit a key to keep it, set it to null to remove it, or set the whole object to null to clear all links. Admin forms send null for cleared inputs and leave fields absent from the form unchanged.
- Imported jobs reject field edits because syncs overwrite those fields. Approval, hiding, technical classification, requeueing, and deactivation remain available.
- Job review follows the site's existing guidance: technical roles in St. John's/NL or remote in Canada can be approved; other relevant local/remote roles can be approved as nontechnical; unrelated postings should be hidden.
- Replacing, clearing, or deleting images removes files only when unreferenced. Imported event covers come from the stored URL, never a form-supplied URL. A failed cover download does not prevent approval.
- Rejection blocks the stored normalized import identity before deletion. Importers and blocklist operations use the same keys.
- Newsletter operations preserve list ownership, draft-only editing, rollout flags, pilot eligibility, and send confirmation. Live sends require the exact campaign subject as confirmationSubject. Subscriber confirmation requests are external operations because they send email.
- Discord undo preserves the existing admin behavior: remove tracking and requeue items without deleting actual Discord messages. Use batch undo for an entire fan-out.
- Undo-reject remains a private admin operation because it accepts a saved browser record. It is not exposed through MCP. Recreate a record and remove its block through the normal operations when needed.

`siteExport` returns a private, single-use download URL that expires after five minutes. For a single cross-type run, call `importSyncAll({ confirm: true })` and poll with `asyncSyncGet({ id })`. The external daily scheduler must use these names. Asynchronous source syncs accept `async: true` and `confirm: true`; poll their IDs with `asyncSyncGet`. Runs are process-local and old completed runs can be evicted.

## Network boundaries

Image, page, feed, and importer requests use shared public-address checks. URLs must be HTTPS on port 443 without credentials. DNS answers are checked and pinned to the connection; redirects are checked again. Downloads have size/time limits. The importer adapter also supports POST requests, bounded decompression, and provider error/retry responses without changing importer parsing or sync algorithms.

Discord and GitHub SDK calls use their fixed provider endpoints. The newsletter client uses the operator-configured lists service, not a client-supplied base URL. Tests mock these providers and the guarded fetch adapters; never run live imports, Discord posts, newsletter sends, or production database commands to validate a change.

## Adding an operation

1. Add a strict input and output contract under `app/operations/contracts`. Keep contracts client-safe: import Zod and shared fields, not database/server modules. Put formats and non-obvious semantics in field descriptions. Reuse shared enums and `updateContract`.
2. Add a server implementation under `app/operations/ops`, using `defineOperation`. Choose its area, access level, risk, description, and a valid example. Call services for writes so slugs, references, images, and lifecycle side effects stay centralized.
3. Add it to the catalog. MCP bindings and search are generated automatically, including the read-only runtime. Do not add business logic or separate validation to the bridge.
4. Map writable columns in `app/operations/coverage`, or exclude them with an ownership/derivation reason. New columns without a decision fail the coverage check. Keep migrated route exceptions empty.
5. Adapt the corresponding admin form and call `runAdminOperation`. Adapters translate shape only: checkboxes, repeated IDs, JSON, and image commands. Preserve redirects and field errors. Register any new route in `app/routes.ts`.
6. Test meaningful state and boundary behavior, including a representative admin/MCP parity case. Mock outbound I/O. Run typecheck, lint, formatting, tests, and build.

Blocklist identities are stored in canonical form with a unique source/key index. Migration 0059 normalizes existing rows and merges duplicates before creating the index. Run `pnpm db:migrate`; the migration runner registers the shared normalizer for this data migration and commits data plus schema changes atomically. Production migration remains operator-run, before deploying code that relies on canonical indexed keys.
