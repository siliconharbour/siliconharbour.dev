# Shared operations migration

This work is a six-layer draft stack. No production calls, real importer syncs,
Discord posts, or newsletter sends are part of verification.

1. Foundation: strict legacy inputs, shared operation authorization and errors,
   bounded public URL fetches, and theme-share administration as the first feature
   using both transports. Restore clean typecheck and formatting gates.
2. Directory: people, companies, education, groups, products, projects,
   technologies, review, gallery, and evidence.
3. Events: recurrence, occurrences, moderation, tags, sources, and sync.
4. Jobs and news: editing, lifecycle, sources, searches, and publishing.
5. Administration: config, comments, Discord, newsletter, imports, images,
   export, and dashboard reads.
6. Cleanup: discovery, complete coverage, transport guards, and documentation.

Operations distinguish public reads from administrative reads. An anonymous MCP
connection must never receive subscriber data, hidden records, configuration,
or upload IP addresses merely because those operations are read-only.

Defaults belong to operations. New events default to pending review; the admin
adapter explicitly requests publication. Imported job edits remain blocked.
Destructive and external operations require write scope and `confirm: true`.
Legacy names remain as deprecated aliases. Undo-reject remains a tracked UI-only
exception; no soft-delete or audit-log schema is introduced.

The route migration allowlist is `app/operations/admin-migration.ts`. Column
coverage and outstanding gaps are explicit in `app/operations/coverage.ts`.
Both shrink as their owning areas migrate. Relations and command inputs map to
related table columns rather than pretending each field belongs to one row.
