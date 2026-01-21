# Agent Instructions

## Work Until Complete

When given a set of tasks, **continue working until ALL tasks are complete**. Do not stop to ask for confirmation between tasks. Execute the full plan.

## Database Migrations

This project uses Drizzle ORM with SQLite. When adding/modifying database schema:

### 1. Update the Schema

Edit `app/db/schema.ts` with your changes.

### 2. Create Migration SQL File

Create a new file in `drizzle/` with the naming pattern `NNNN_description.sql` (e.g., `0018_add_event_requires_signup.sql`).

**Important SQL syntax rules:**
- Use backticks around table and column names: `` ALTER TABLE `events` ADD `column_name` ... ``
- NOT double quotes (those will cause "no such column" errors)
- Follow the style of existing migrations in `drizzle/`

Example:
```sql
ALTER TABLE `events` ADD `requires_signup` integer NOT NULL DEFAULT 0;
```

### 3. Register in Journal

Add an entry to `drizzle/meta/_journal.json`:
```json
{
  "idx": 18,
  "version": "6", 
  "when": 1768703000000,
  "tag": "0018_add_event_requires_signup",
  "breakpoints": true
}
```
- `idx`: Next sequential number
- `tag`: Must match the SQL filename (without `.sql`)
- `when`: Timestamp (can increment from previous)

### 4. Run Migration

```bash
npm run db:migrate
```

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

1. **Run quality gates** (if code changed) - Tests, linters, builds
2. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
3. **Verify** - All changes committed AND pushed

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
