interface Endpoint {
  path: string;
  description: string;
}

const endpoints: Endpoint[] = [
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

/**
 * Styled API endpoints table
 */
export function ApiTable() {
  return (
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
  );
}
