import type { Route } from "./+types/llms-txt";
import { markdownResponse } from "~/lib/markdown.server";

export async function loader({}: Route.LoaderArgs) {
  const content = `# Silicon Harbour

> A community tech directory for St. John's, Newfoundland & Labrador. Discover events, companies, people, groups, jobs, news, projects, products, and educational institutions in the local tech scene.

siliconharbour.dev is a community directory for developers and builders in St. John's. The goal is to make it easier for people to discover and connect with the local technology community. Whether you're looking for events to attend, companies to work for, meetup groups to join, or just want to learn more about what's happening, this site aims to be a helpful resource.

This site is primarily for **developers and builders** - people who write code, ship products, and make things. Software engineers, web developers, data scientists, DevOps folks, designers who code, and anyone else who spends their days solving technical problems.

## Navigation

All pages on this site have a \`.md\` version available by appending \`.md\` to the URL. For example:
- \`/about\` (HTML) -> \`/about.md\` (Markdown)
- \`/directory/companies/colab-software\` -> \`/directory/companies/colab-software.md\`

### URL Patterns

- **Home:** \`/\` or \`/index.md\`
- **Events:** \`/events\` (list), \`/events/{slug}\` (detail)
- **Jobs:** \`/jobs\` (list), \`/jobs/{slug}\` (detail)
- **News:** \`/news\` (list), \`/news/{slug}\` (detail)
- **Directory:**
  - Companies: \`/directory/companies\` (list), \`/directory/companies/{slug}\` (detail)
  - People: \`/directory/people\` (list), \`/directory/people/{slug}\` (detail)
  - Groups: \`/directory/groups\` (list), \`/directory/groups/{slug}\` (detail)
  - Projects: \`/directory/projects\` (list), \`/directory/projects/{slug}\` (detail)
  - Products: \`/directory/products\` (list), \`/directory/products/{slug}\` (detail)
  - Education: \`/directory/education\` (list), \`/directory/education/{slug}\` (detail)
  - Technologies: \`/directory/technologies\` (list), \`/directory/technologies/{slug}\` (detail)

### Query Parameters

List pages support pagination and search:
- \`?q=searchterm\` - Search/filter results
- \`?limit=20\` - Number of items per page (default: 20, max: 100)
- \`?offset=0\` - Skip N items for pagination

Example: \`/directory/companies.md?q=software&limit=10\`

## Documentation

- [About](/about.md): About the site, FAQ, and how to get involved
- [API Documentation](/api.md): REST API endpoints for programmatic access
- [Code of Conduct](/conduct.md): Community guidelines
- [Stay Connected](/stay-connected.md): RSS feeds, calendar subscriptions, and social links

## JSON API

A read-only JSON API is available at \`/api/*\`. No authentication required. CORS enabled.

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| \`GET /api/companies\` | List companies |
| \`GET /api/companies/{slug}\` | Get company details |
| \`GET /api/events\` | List events |
| \`GET /api/events/{slug}\` | Get event details |
| \`GET /api/groups\` | List groups |
| \`GET /api/groups/{slug}\` | Get group details |
| \`GET /api/jobs\` | List job listings |
| \`GET /api/jobs/{slug}\` | Get job details |
| \`GET /api/education\` | List educational institutions |
| \`GET /api/education/{slug}\` | Get education details |
| \`GET /api/news\` | List news articles |
| \`GET /api/news/{slug}\` | Get news article |
| \`GET /api/people\` | List people |
| \`GET /api/people/{slug}\` | Get person details |
| \`GET /api/projects\` | List projects |
| \`GET /api/projects/{slug}\` | Get project details |
| \`GET /api/products\` | List products |
| \`GET /api/products/{slug}\` | Get product details |
| \`GET /api/technologies\` | List technologies |
| \`GET /api/technologies/{slug}\` | Get technology details |
| \`GET /api/imported-jobs\` | List imported jobs from company career pages |
| \`GET /api/imported-jobs/{id}\` | Get imported job details |

The \`/api/imported-jobs\` endpoint supports filtering by company: \`?company={slug}\`

API responses include pagination info and Link headers for navigation. Use \`?limit=N&offset=N\` for pagination.

## Feeds

- [Combined RSS Feed](/feed.rss): All content types
- [Events RSS](/events.rss): Events only
- [News RSS](/news.rss): News articles only
- [Jobs RSS](/jobs.rss): Job listings only
- [Calendar (iCal)](/calendar.ics): Subscribe to events in your calendar

## Directory Sections

- [Companies](/directory/companies.md): Local tech companies
- [People](/directory/people.md): Developers and builders in the community
- [Groups](/directory/groups.md): Meetups and community groups
- [Projects](/directory/projects.md): Open source and community projects
- [Products](/directory/products.md): Products built locally
- [Education](/directory/education.md): Educational institutions and programs
- [Technologies](/directory/technologies.md): Technologies used by local companies

## Content

- [Events](/events.md): Tech events, meetups, and workshops
- [News](/news.md): Community news and updates
- [Jobs](/jobs.md): Job opportunities at local companies

## Optional

- [Source Code](https://github.com/siliconharbour/siliconharbour.dev): The site is open source
`;

  return markdownResponse(content);
}
