import { useRouteLoaderData } from "react-router";
import type { HostFnCategory, HostFunctionDocs, HostFunctionDocsEntry } from "~/mcp/bridge";

interface ToolMeta {
  name: string;
  title: string;
  description: string;
  auth: "Public" | "Authenticated";
  bindings: "none" | "read" | "execute";
}

const TOOLS: ToolMeta[] = [
  {
    name: "search",
    title: "search",
    description:
      "Search the SiliconHarbour API schema to discover available entities and field shapes. " +
      "Call this first to learn what data exists, then use query or execute to fetch it.",
    auth: "Public",
    bindings: "none",
  },
  {
    name: "query",
    title: "query",
    description:
      "Execute restricted JavaScript in Code Mode to read SiliconHarbour data. Functions below " +
      "are available through tools.siliconharbour. Each call hits the real database on-demand. " +
      "Timeout: 10 seconds.",
    auth: "Public",
    bindings: "read",
  },
  {
    name: "execute",
    title: "execute",
    description:
      "Like query, but also exposes sync, creation, review, and lifecycle functions. " +
      "Requires an OAuth-authorized MCP session with the mcp:write scope. Timeout: 60 seconds.",
    auth: "Authenticated",
    bindings: "execute",
  },
];

const CATEGORY_ORDER: HostFnCategory[] = [
  "read",
  "sources",
  "sync",
  "async-sync",
  "creation",
  "lookup",
  "search",
  "lifecycle",
];

const CATEGORY_LABELS: Record<HostFnCategory, string> = {
  read: "Read",
  sources: "Import sources",
  sync: "Synchronous sync",
  "async-sync": "Background sync",
  creation: "Creation",
  lookup: "Lookup / detail",
  search: "External search",
  lifecycle: "Lifecycle / review",
};

function groupByCategory(entries: HostFunctionDocsEntry[]) {
  const byCat = new Map<HostFnCategory, HostFunctionDocsEntry[]>();
  for (const entry of entries) {
    const arr = byCat.get(entry.category) ?? [];
    arr.push(entry);
    byCat.set(entry.category, arr);
  }
  return byCat;
}

function FunctionTable({ entries }: { entries: HostFunctionDocsEntry[] }) {
  const byCat = groupByCategory(entries);
  return (
    <div className="flex flex-col gap-gap-4">
      {CATEGORY_ORDER.filter((cat) => byCat.has(cat)).map((cat) => (
        <div key={cat}>
          <div className="text-xs font-medium uppercase tracking-wide text-muted mb-1.5">
            {CATEGORY_LABELS[cat]} ({byCat.get(cat)?.length ?? 0})
          </div>
          <div className="border border-line divide-y divide-harbour-100">
            {byCat.get(cat)?.map((entry) => (
              <div key={entry.name} className="px-pad-3 py-pad-2 text-sm flex flex-col gap-gap-1">
                <div className="flex items-baseline gap-gap-2 flex-wrap">
                  <code className="text-heading text-xs">{`tools.siliconharbour.${entry.signature}`}</code>
                </div>
                <div className="text-muted text-xs">{entry.description}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface LoaderData {
  mcpDocs?: HostFunctionDocs;
}

export function MCPTools() {
  const data = useRouteLoaderData<LoaderData>("routes/api-docs");
  const docs = data?.mcpDocs;

  return (
    <div className="not-prose flex flex-col gap-gap-3">
      {TOOLS.map((tool) => {
        const entries =
          tool.bindings === "execute"
            ? docs?.execute
            : tool.bindings === "read"
              ? docs?.read
              : undefined;
        return (
          <details key={tool.name} className="border border-line bg-surface">
            <summary className="px-pad-4 py-pad-3 text-sm cursor-pointer hover:bg-soft flex items-center justify-between gap-gap-3">
              <span className="flex items-baseline gap-gap-3 flex-wrap">
                <code className="text-heading font-medium">{tool.title}</code>
                <span
                  className={
                    tool.auth === "Authenticated"
                      ? "text-xs px-pad-1-5 py-pad-0-5 bg-amber-50 text-amber-700 border border-amber-200"
                      : "text-xs px-pad-1-5 py-pad-0-5 bg-green-50 text-green-700 border border-green-200"
                  }
                >
                  {tool.auth}
                </span>
                {entries && (
                  <span className="text-xs text-subtle">{entries.length} functions</span>
                )}
              </span>
              <span className="text-subtle text-xs">expand</span>
            </summary>
            <div className="px-pad-4 py-pad-3 border-t border-harbour-100 flex flex-col gap-gap-3">
              <p className="text-sm text-body">{tool.description}</p>
              {tool.bindings !== "none" && entries && entries.length > 0 && (
                <FunctionTable entries={entries} />
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
