import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pendingAdminRoutes } from "~/operations/admin-migration";

function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(path, entry.name))
      : entry.name.endsWith(".tsx")
        ? [join(path, entry.name)]
        : [],
  );
}

it("keeps migrated route mutations behind operations", () => {
  const routes = [...files("app/routes/manage"), "app/routes/api.comments.delete.tsx"];
  for (const path of routes) {
    const source = readFileSync(path, "utf8");
    if (pendingAdminRoutes[path]) continue;
    expect(source, path).not.toMatch(/from\s*["']~\/operations\/ops\//);
    expect(source, path).not.toMatch(
      /\b(?:db|rawDb)\s*\.\s*(?:insert|update|delete|transaction|exec)\s*\(/,
    );
    for (const match of source.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*["'](~\/lib\/[^"']+)["']/g,
    )) {
      for (const imported of match[1].split(",").map((name) => name.trim())) {
        const [name, local = name] = imported.split(/\s+as\s+/);
        if (
          /^(create|update|delete|save|set|approve|reject|hide|unhide|publish|unpublish|block|unblock|sync|fetch|import|start|continue|pause|reset|send|post|mark|cancel|clear|apply|adopt|remove|add|convert|stage|refresh|skip|undo|deactivate|requeue|unapprove|process|download)[A-Z]/.test(
            name,
          )
        )
          expect(source, `${path}: ${name}`).not.toMatch(new RegExp(`\\b${local}\\s*\\(`));
      }
    }
  }
});

it("keeps admin reads behind the catalog", () => {
  const allowedServerImports: Record<string, string> = {
    "~/lib/session.server": "Session authentication and logout.",
    "~/lib/auth.server": "Login authenticates credentials outside the operation catalog.",
    "~/lib/admin/run-operation.server": "Authenticated catalog transport.",
    "~/lib/admin/directory-import-action.server": "Form adapter for catalog operations.",
    "~/lib/recurrence.server": "Pure recurrence parsing and display labels; no I/O.",
  };
  for (const path of files("app/routes/manage")) {
    const source = readFileSync(path, "utf8");
    expect(source, path).not.toMatch(/from\s*["']~\/operations\/ops\//);
    expect(source, path).not.toMatch(/import\s+(?!type\b)[^;]*from\s*["']~\/db["']/);
    for (const match of source.matchAll(
      /import\s+(?!type\b)[^;]*from\s*["'](~\/lib\/[^"']+\.server)["']/g,
    )) {
      expect(allowedServerImports[match[1]], `${path}: ${match[1]}`).toBeTruthy();
    }
  }
});
