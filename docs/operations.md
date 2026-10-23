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

Every operation enforces access itself. Admin sessions receive read/write scopes; MCP contexts use the authenticated actor and granted scopes. Every destructive or external operation requires `confirm: true`. JSON Schemas describe inputs and outputs; input validation runs on every call, while output contracts are asserted in development and tests. Production does not parse outputs.

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
- Rejecting a person or company retains its ID, slug, images and relationships outside normal directory and review reads. Use `rejectedRecordList` and `rejectedRecordRestore({id, confirm:true})` to undo within seven days. `/manage/rejected-records` provides the same controls. Expired entries remain available for permanent cleanup through `rejectedRecordDelete`; import blocks remain after permanent deletion. No browser-held record payload is accepted.

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

Inside code mode, `Object.keys(tools.siliconharbour)` lists callable names; `typeof` does not prove that a name exists. Unknown calls suggest nearby visible names, including when caught by the program. A write name used through query explains execute/scope requirements. Use `operationDescribe({name})` for permitted input/output schemas and examples inside a program. MCP search also indexes example titles and output fields. The server version includes a hash of the catalog contracts so schema changes are identifiable.

All list operations use limit/offset, query, an explicit supported sort and order, and return `{items, total, nextOffset}`. Local database totals count the filtered result before paging. Source/tag/importer collections are small snapshots and use the same page shape. Public event pages retain recurrence-aware chronological ordering; their sort is startDate with ascending order. Newsletter providers do not expose counts, so their total is null. Follow nextOffset until null, including empty filtered campaign pages; do not infer completion from a short page. Campaign offsets track provider rows to avoid rescanning or fabricating filtered totals. These are current contracts, with no alternate array or page/perPage forms.

## Structured values

News-source and global keywords are arrays of strings. Admin text fields adapt comma-separated input; the existing TEXT columns retain their storage format. Campaign `audienceData` is a parsed subscriber-ID array, a `{testSubscriberIds}` object, or null. Timestamps, including campaign and theme-share dates, use ISO 8601 strings.

`jobSourceManualSync` accepts `{id, jobs}` with typed job records, not JSON text. The admin form parses the browser script's array before calling it. Invalid rows fail validation instead of disappearing. Async sync results expose typed importer counts and errors, the initiating administrator and transport, and mark `success:false` responses as failed steps.

## Settings changes

`siteConfigSave` patches supplied fields atomically. Omitted flags, keywords and credentials keep their values. Use `newsGlobalKeywords: null` or `[]` to clear keywords, and `botToken: null` to clear the credential. The example hides only jobs; it preserves every other setting. Prefer the granular visibility or keyword operations when changing one setting.

The rejected-record migration must be applied by the operator before deploying this layer. Expiry ends the restore window; permanent cleanup is explicit, so records are never silently destroyed by a read.

## Risk and missing targets

Risk describes the action, not whether it uses HTTP. Reads from fixed, configured providers remain reads. Normal edits and provider CRUD are writes. Explicit deletion, file replacement, bulk removal and overwriting a credential that cannot be read back are destructive. Live importer requests, arbitrary URL previews and outgoing messages are external. Destructive and external operations require `confirm: true`.

Embedded image commands also require `confirm: true` for writes, so entity updates and standalone image operations have the same confirmation rule. Both paths use the same image processor and unreferenced-file cleanup. `siteConfigSave` stays destructive because it can overwrite the masked Discord token; reversible section/comment flags and keywords use write operations.

An ID-addressed delete or removal fails with NotFound when its target is missing. Key-addressed `blocklistRemove` returns the actual `removed` boolean. Repeating a status change on an existing record remains valid. `discordUndo` and `discordUndoBatch` delete local tracking, require confirmation and make no Discord request.

Use `eventImportHide` to unpublish either a manual or imported event. TechNL refresh revalidates `jobTechNLList`; there is no second refresh operation. `siteExport` requires write scope because its URL grants access to private export data.

## Bulk moderation and conditional creation

Use `jobBulkApprove` / `jobBulkHide`, `newsBulkApprove` / `newsBulkHide`, and `eventImportBulkApprove` / `eventImportBulkHide` for up to 200 IDs. Repeated IDs run once, in input order. Each result has `{id,ok,error?}`; one missing record does not stop the rest. Bulk hide requires confirmation. `blocklistAddMany` accepts up to 200 items and returns canonical keys, deletion IDs and per-item errors; it also requires confirmation. Invalid input or authorization fails before any item runs.

Creates, `newsLinkSubmit` and `jobSearchImport` return `created`. Set `ifNotExists: true` to return a matching stored record unchanged. Matching happens before image consumption, source validation or outgoing confirmation. Concurrent matching creates in this application process run in order, and every waiter rechecks stored state. A failed attempt releases its slot.

Directory matching requires a canonical URL or GitHub identity; names alone never match people or companies. Projects use a repository or website URL. Technology catalog entries use their catalog slug. Events match link, parent and normalized schedule; news articles without an external URL match their exact type, title and content. Source identities use provider identifiers or feed URLs. Missing identity fields fail instead of guessing. Rejected identities must be restored or permanently deleted first.

Newsletter matching stays within the configured list. Campaign lookup also matches subject, body, template and sender. Existing memberships are returned without resubscribing or sending another confirmation; use ordinary `newsletterSubscriberCreate` to resubscribe. Provider lookups inspect at most 2,000 rows and fail if they cannot establish absence. The configured provider API does not expose campaign deletion. Matching uses current records.

Admin loaders use `loadAdminOperation` for one catalog read and `loadAllAdminItems` for complete form choices or review collections. List pages use the catalog page directly, including its total and continuation. Provider lists with no exact count use previous/next controls. Keep domain reads out of routes: add a strict catalog read when the UI needs new data. The admin-route guard permits authentication, transport adapters and pure recurrence formatting only.

Public detail reads use `companyPublicGet`, `personPublicGet`, `educationPublicGet`, `groupPublicGet`, `productPublicGet`, `projectPublicGet`, `technologyPublicGet`, `eventPublicGet`, `jobPublicGet`, and `newsPublicGet`, each accepting `{slug}`. They return NotFound for hidden or missing records. Company details include public technologies and products; project details include technologies and gallery images; technology details include visible companies and projects; event details include visible parent and schedule entries. A public product or job may have `company: null` when its parent is hidden.

Public lists and details select fields from `contracts/public-outputs.ts`. Import identifiers, moderation flags, source configuration and evidence provenance stay in administrator outputs. Image values remain stored asset names, matching existing MCP conventions; the REST API is unchanged. When adding a public field, add it to the explicit projection and test its visibility policy.

User and OAuth-client administration remains script-only. Newsletter campaign deletion and subscriber resubscription/deletion are not exposed by this integration.
