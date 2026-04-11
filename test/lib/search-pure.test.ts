import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// =============================================================================
// escapeFtsQuery, buildFtsQuery, and needsLikeFallback are NOT exported from
// search.server.ts. They are private helpers. To test the actual source logic
// without modifying app code, we extract and evaluate the function bodies from
// the source file at test time. This verifies the real implementation.
// =============================================================================

// Extract the three pure functions from the source file for testing.
// This approach tests the actual source code without requiring exports.
const sourceCode = readFileSync(resolve(__dirname, "../../app/lib/search.server.ts"), "utf-8");

// Build a self-contained module with the three functions
function extractFunction(name: string, src: string): string {
  // Match "function name(...): returnType {" and capture the full body
  const regex = new RegExp(`function ${name}\\([^)]*\\)[^{]*\\{`, "g");
  const match = regex.exec(src);
  if (!match) throw new Error(`Could not find function ${name} in source`);

  // Find the matching closing brace
  let depth = 1;
  let i = match.index + match[0].length;
  while (depth > 0 && i < src.length) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") depth--;
    i++;
  }

  return src.slice(match.index, i);
}

// Build a JS module with the three functions (strip TypeScript type annotations)
const escapeFtsBody = extractFunction("escapeFtsQuery", sourceCode);
const needsLikeBody = extractFunction("needsLikeFallback", sourceCode);
const buildFtsBody = extractFunction("buildFtsQuery", sourceCode);

// Create functions from source — strip TS type annotations for eval
const cleanTs = (s: string) => s.replace(/:\s*string/g, "").replace(/:\s*boolean/g, "");

const moduleCode = `
${cleanTs(escapeFtsBody)}
${cleanTs(needsLikeBody)}
${cleanTs(buildFtsBody)}
return { escapeFtsQuery, needsLikeFallback, buildFtsQuery };
`;

const fns = new Function(moduleCode)() as {
  escapeFtsQuery: (query: string) => string;
  needsLikeFallback: (query: string) => boolean;
  buildFtsQuery: (query: string) => string;
};

const { escapeFtsQuery, needsLikeFallback, buildFtsQuery } = fns;

// =============================================================================
// escapeFtsQuery
// =============================================================================

describe("escapeFtsQuery", () => {
  it("passes through normal text unchanged", () => {
    expect(escapeFtsQuery("hello world")).toBe("hello world");
  });

  it("strips asterisks", () => {
    expect(escapeFtsQuery("hello*")).toBe("hello");
  });

  it("strips double quotes", () => {
    expect(escapeFtsQuery('"hello"')).toBe("hello");
  });

  it("strips carets", () => {
    expect(escapeFtsQuery("^hello")).toBe("hello");
  });

  it("strips parentheses", () => {
    expect(escapeFtsQuery("(hello)")).toBe("hello");
  });

  it("strips multiple FTS operators at once", () => {
    expect(escapeFtsQuery('*"hello"^(world)')).toBe("hello world");
  });

  it("normalizes multiple spaces to single space", () => {
    expect(escapeFtsQuery("hello    world")).toBe("hello world");
  });

  it("trims leading/trailing whitespace", () => {
    expect(escapeFtsQuery("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(escapeFtsQuery("")).toBe("");
  });

  it("handles string of only special chars", () => {
    expect(escapeFtsQuery('*"^()')).toBe("");
  });
});

// =============================================================================
// buildFtsQuery
// =============================================================================

describe("buildFtsQuery", () => {
  it("quotes a single word", () => {
    expect(buildFtsQuery("hello")).toBe('"hello"');
  });

  it("quotes each word for multi-word query", () => {
    expect(buildFtsQuery("hello world")).toBe('"hello" "world"');
  });

  it("returns empty string for empty input", () => {
    expect(buildFtsQuery("")).toBe("");
  });

  it("strips FTS operators before quoting", () => {
    expect(buildFtsQuery("hello*")).toBe('"hello"');
  });

  it("handles string with only special chars", () => {
    expect(buildFtsQuery('*"^()')).toBe("");
  });

  it("normalizes whitespace before building query", () => {
    expect(buildFtsQuery("  foo   bar  ")).toBe('"foo" "bar"');
  });
});

// =============================================================================
// needsLikeFallback
// =============================================================================

describe("needsLikeFallback", () => {
  it("returns true when a word has fewer than 3 characters", () => {
    expect(needsLikeFallback("ab")).toBe(true);
  });

  it("returns false when all words are 3+ characters", () => {
    expect(needsLikeFallback("abc")).toBe(false);
  });

  it("returns true when any word is shorter than 3 chars (mixed)", () => {
    expect(needsLikeFallback("ab cdef")).toBe(true);
  });

  it("returns false when all words are 3+ chars (multi-word)", () => {
    expect(needsLikeFallback("abcd efgh")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(needsLikeFallback("")).toBe(false);
  });

  it("returns true for single character", () => {
    expect(needsLikeFallback("a")).toBe(true);
  });

  it("returns false for exactly 3 characters", () => {
    expect(needsLikeFallback("abc")).toBe(false);
  });

  it("returns true for two-letter word among long words", () => {
    expect(needsLikeFallback("hello of world")).toBe(true);
  });
});
