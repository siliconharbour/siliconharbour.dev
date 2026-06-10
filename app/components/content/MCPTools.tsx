import { useRouteLoaderData } from "react-router";
import type {
  HostFnCategory,
  HostFunctionDocs,
  HostFunctionDocsEntry,
} from "~/mcp/bridge";

interface ToolMeta {
  name: string;
  title: string;
  description: string;
  auth: "Public" | "Authenticated";
  /**
   * Which set of host functions this tool exposes. `search` has no
   * sandbox bindings (it queries the OpenAPI schema), so it renders
   * a hand-written summary instead of a function table.
   */
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
      "Execute JavaScript in a secure QuickJS sandbox to read SiliconHarbour data. Imports below " +
      "are available from the 'siliconharbour' module. Each call hits the real database on-demand. " +
      "Timeout: 10 seconds.",
    auth: "Public",
    bindings: "read",
  },
  {
    name: "execute",
    title: "execute",
    description:
      "Like query, but also exposes sync, creation, review, and lifecycle functions. " +
      "Requires an authenticated MCP session (apiToken). Timeout: 60 seconds.",
    auth: "Authenticated",
    bindings: "execute",
  },
];

const CATEGORY_ORDER: HostFnCategory[] = [
  "read",
  "sources",
  "pending",
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
  pending: "Pending review",
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
    <div className="flex flex-col gap-4">
      {CATEGORY_ORDER.filter((cat) => byCat.has(cat)).map((cat) => (
        <div key={cat}>
          <div className="text-xs font-medium uppercase tracking-wide text-harbour-500 mb-1.5">
            {CATEGORY_LABELS[cat]} ({byCat.get(cat)?.length ?? 0})
          </div>
          <div className="border border-harbour-200 divide-y divide-harbour-100">
            {byCat.get(cat)?.map((entry) => (
              <div key={entry.name} className="px-3 py-2 text-sm flex flex-col gap-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <code className="text-harbour-700 text-xs">{entry.signature}</code>
                  {entry.status === "undocumented" && (
                    <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
                      undocumented
                    </span>
                  )}
                </div>
                <div className="text-harbour-500 text-xs">{entry.description}</div>
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

/**
 * Auto-generated MCP tool listing for the /api docs page.
 * Pulls metadata off the host() wrappers in app/mcp/bridge.ts via the
 * api-docs.tsx loader, so the listing can never drift from the bridge.
 */
export function MCPTools() {
  const data = useRouteLoaderData<LoaderData>("routes/api-docs");
  const docs = data?.mcpDocs;

  return (
    <div className="not-prose flex flex-col gap-3">
      {TOOLS.map((tool) => {
        const entries = tool.bindings === "execute" ? docs?.execute : tool.bindings === "read" ? docs?.read : undefined;
        return (
          <details key={tool.name} className="border border-harbour-200 bg-white">
            <summary className="px-4 py-3 text-sm cursor-pointer hover:bg-harbour-50 flex items-center justify-between gap-3">
              <span className="flex items-baseline gap-3 flex-wrap">
                <code className="text-harbour-700 font-medium">{tool.title}</code>
                <span
                  className={
                    tool.auth === "Authenticated"
                      ? "text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200"
                      : "text-xs px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200"
                  }
                >
                  {tool.auth}
                </span>
                {entries && (
                  <span className="text-xs text-harbour-400">{entries.length} functions</span>
                )}
              </span>
              <span className="text-harbour-400 text-xs">expand</span>
            </summary>
            <div className="px-4 py-3 border-t border-harbour-100 flex flex-col gap-3">
              <p className="text-sm text-harbour-600">{tool.description}</p>
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
