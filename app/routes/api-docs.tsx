import type { Route } from "./+types/api-docs";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "API - siliconharbour.dev" },
    {
      name: "description",
      content: "Public JSON API for accessing St. John's tech community data",
    },
  ];
}

const BASE_URL = "https://siliconharbour.dev";

const endpoints = [
  { path: "/api/companies", description: "List companies" },
  { path: "/api/companies/:slug", description: "Get company" },
  { path: "/api/events", description: "List events" },
  { path: "/api/events/:slug", description: "Get event" },
  { path: "/api/groups", description: "List groups" },
  { path: "/api/groups/:slug", description: "Get group" },
  { path: "/api/jobs", description: "List jobs" },
  { path: "/api/jobs/:slug", description: "Get job" },
  { path: "/api/education", description: "List education" },
  { path: "/api/education/:slug", description: "Get education" },
  { path: "/api/news", description: "List news" },
  { path: "/api/news/:slug", description: "Get news article" },
  { path: "/api/people", description: "List people" },
  { path: "/api/people/:slug", description: "Get person" },
  { path: "/api/projects", description: "List projects" },
  { path: "/api/projects/:slug", description: "Get project" },
  { path: "/api/products", description: "List products" },
  { path: "/api/products/:slug", description: "Get product" },
];

export default function ApiDocsPage() {
  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <article className="prose">
        <h1>API</h1>

        <p className="text-lg">
          A read-only JSON API for accessing community data. No authentication required. CORS enabled.
        </p>

        <div className="not-prose bg-red-50 border border-red-200 px-4 py-3 my-6">
          <p className="text-sm text-red-800">
            While this site is under construction, I wouldn't build against this API
            if I were you - this is all subject to change heavily!
          </p>
        </div>

        <h2>Base URL</h2>
        <div className="not-prose">
          <code className="block p-3 bg-harbour-50 text-harbour-700 text-sm">
            {BASE_URL}
          </code>
        </div>

        <h2>Endpoints</h2>

        <div className="not-prose overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-harbour-200">
                <th className="text-left py-2 pr-4 font-medium text-harbour-700">Endpoint</th>
                <th className="text-left py-2 font-medium text-harbour-700">Description</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) => (
                <tr key={endpoint.path} className="border-b border-harbour-100">
                  <td className="py-2 pr-4">
                    <code className="text-harbour-600">{endpoint.path}</code>
                  </td>
                  <td className="py-2 text-harbour-500">{endpoint.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Pagination</h2>
        <p>List endpoints support pagination:</p>
        <ul>
          <li>
            <code>limit</code> - Number of items (default: 20, max: 100)
          </li>
          <li>
            <code>offset</code> - Items to skip (default: 0)
          </li>
        </ul>

        <p>Responses include a <code>pagination</code> object:</p>
        <div className="not-prose">
          <pre className="p-3 bg-harbour-50 text-harbour-700 text-sm overflow-x-auto">
{`{
  "data": [...],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}`}
          </pre>
        </div>

        <p>
          Responses also include{" "}
          <a
            href="https://tools.ietf.org/html/rfc5988"
            target="_blank"
            rel="noopener noreferrer"
          >
            RFC 5988
          </a>{" "}
          <code>Link</code> headers for navigation:
        </p>
        <div className="not-prose">
          <pre className="p-3 bg-harbour-50 text-harbour-700 text-sm overflow-x-auto">
{`Link: <https://siliconharbour.dev/api/companies?limit=20&offset=20>; rel="next",
      <https://siliconharbour.dev/api/companies?limit=20&offset=0>; rel="first"`}
          </pre>
        </div>

        <h2>OpenAPI Specification</h2>

        <p>
          <a href="/openapi.json">View OpenAPI Spec</a>
        </p>

        <h2>Feeds</h2>

        <p>
          RSS feeds and an iCal calendar are also available.
          See <a href="/stay-connected">Stay Connected</a> for details.
        </p>
      </article>
    </div>
  );
}
