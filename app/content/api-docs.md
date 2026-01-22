---
title: API
description: Public JSON API for accessing St. John's tech community data
---

# API

A read-only JSON API for accessing community data. No authentication required. CORS enabled.

> **Note:** While this site is under construction, the API is subject to change. Don't build against it for production use yet.

## Base URL

```
https://siliconharbour.dev
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/companies` | List companies |
| `GET /api/companies/:slug` | Get company |
| `GET /api/events` | List events |
| `GET /api/events/:slug` | Get event |
| `GET /api/groups` | List groups |
| `GET /api/groups/:slug` | Get group |
| `GET /api/jobs` | List jobs |
| `GET /api/jobs/:slug` | Get job |
| `GET /api/education` | List education |
| `GET /api/education/:slug` | Get education |
| `GET /api/news` | List news |
| `GET /api/news/:slug` | Get news article |
| `GET /api/people` | List people |
| `GET /api/people/:slug` | Get person |
| `GET /api/projects` | List projects |
| `GET /api/projects/:slug` | Get project |
| `GET /api/products` | List products |
| `GET /api/products/:slug` | Get product |

## Pagination

List endpoints support pagination:

- `limit` - Number of items (default: 20, max: 100)
- `offset` - Items to skip (default: 0)

Responses include a `pagination` object:

```json
{
  "data": [...],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

Responses also include [RFC 5988](https://tools.ietf.org/html/rfc5988) `Link` headers for navigation:

```
Link: <https://siliconharbour.dev/api/companies?limit=20&offset=20>; rel="next",
      <https://siliconharbour.dev/api/companies?limit=20&offset=0>; rel="first"
```

## OpenAPI Specification

[View OpenAPI Spec](/openapi.json)

## Feeds

RSS feeds and an iCal calendar are also available. See [Stay Connected](/stay-connected) for details.

- `/feed.rss` - Combined RSS feed
- `/events.rss` - Events RSS feed
- `/news.rss` - News RSS feed
- `/jobs.rss` - Jobs RSS feed
- `/calendar.ics` - iCal calendar subscription
