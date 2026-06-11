import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    coverage: {
      // v8 is the recommended default; vitest 3.2+ uses AST-based
      // remapping so its accuracy matches istanbul without the
      // pre-instrumentation overhead.
      provider: "v8",
      // text   — terminal summary at the end of the suite
      // html   — coverage/index.html for browsing per-file
      // json-summary — coverage/coverage-summary.json for CI / scripts
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      // Scope to our actual app code. Coverage of node_modules and the
      // build output is noise.
      include: ["app/**/*.{ts,tsx}"],
      exclude: [
        // Type-only declarations
        "app/**/*.d.ts",
        // React Router framework artifacts (generated types, root entry).
        // root.tsx is the app shell — meaningful tests need playwright,
        // not vitest, so excluding it keeps the report honest.
        "app/root.tsx",
        "app/routes.ts",
        ".react-router/**",
        // MDX content is markdown rendered at build time, not behaviour.
        "app/content/**",
        // Static assets and CSS.
        "app/assets/**",
        "app/**/*.css",
      ],
      // We never want a passing local run to be blocked by 100% in the
      // text report when there's no threshold gate.
      skipFull: false,
      // Include every covered + every uncovered source file in the
      // report. Without this, files with zero references show as
      // missing rather than 0% — and we WANT to see the 0%s.
      all: true,
    },
  },
});
