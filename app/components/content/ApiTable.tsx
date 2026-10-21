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
  { path: "/api/technologies", description: "List technologies" },
  { path: "/api/technologies/:slug", description: "Get technology" },
];

/**
 * Styled API endpoints table
 */
export function ApiTable() {
  return (
    <div className="not-prose overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="text-left py-pad-2 pr-pad-4 font-medium text-heading">Endpoint</th>
            <th className="text-left py-pad-2 font-medium text-heading">Description</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((endpoint) => (
            <tr key={endpoint.path} className="border-b border-harbour-100">
              <td className="py-pad-2 pr-pad-4">
                <code className="text-body">{endpoint.path}</code>
              </td>
              <td className="py-pad-2 text-muted">{endpoint.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
