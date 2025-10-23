# Issues API Endpoint

## Overview

The Issues API endpoint provides filtering and pagination for issues within a project. It supports all the filtering capabilities of the IssuesRepository.

## Endpoint

```
GET /api/projects/[projectId]/issues
```

## Query Parameters

### Required
- `projectId` (path parameter) - The project ID

### Optional Filters
- `commitUuid` - Specific commit UUID (defaults to 'live')
- `documentUuid` - Filter by specific document/prompt
- `statuses` - Comma-separated list of statuses (new, escalating, resolved, ignored)
- `seenAtRelative` - Relative date range (today, last_7_days, etc.)
- `seenAtFrom` - Custom date range start (ISO string)
- `seenAtTo` - Custom date range end (ISO string)
- `sort` - Sort order (relevance, lastSeen, firstSeen, title)
- `cursor` - Pagination cursor
- `limit` - Number of results (1-100, default: 20)

## Usage Examples

### 1. Get All Issues for a Project

```bash
GET /api/projects/123/issues
```

### 2. Get Issues for a Specific Document

```bash
GET /api/projects/123/issues?documentUuid=prompt-uuid-456
```

### 3. Get New and Escalating Issues

```bash
GET /api/projects/123/issues?statuses=new,escalating
```

### 4. Get Issues from Last 7 Days

```bash
GET /api/projects/123/issues?seenAtRelative=last_7_days
```

### 5. Get Issues with Custom Date Range

```bash
GET /api/projects/123/issues?seenAtFrom=2024-01-01&seenAtTo=2024-01-31
```

### 6. Combined Filtering

```bash
GET /api/projects/123/issues?documentUuid=prompt-uuid-456&statuses=new,escalating&seenAtRelative=last_7_days&sort=relevance
```

### 7. Pagination

```bash
# First page
GET /api/projects/123/issues?limit=10

# Next page (use cursor from previous response)
GET /api/projects/123/issues?cursor=123&limit=10
```

## Response Format

```typescript
{
  issues: Array<{
    id: number
    workspaceId: number
    projectId: number
    documentUuid: string
    title: string
    description: string
    firstSeenResultId: number | null
    lastSeenResultId: number | null
    resolvedAt: Date | null
    ignoredAt: Date | null
    createdAt: Date
    updatedAt: Date
    // Computed fields
    last7DaysCount: number
    lastSeenDate: Date | null
    escalatingCount: number
    isNew: boolean
    isResolved: boolean
    isIgnored: boolean
  }>
  hasMore: boolean
  nextCursor: string | null
}
```

## JavaScript/TypeScript Usage

```typescript
// Get issues for a specific document
const response = await fetch('/api/projects/123/issues?documentUuid=prompt-uuid-456')
const data = await response.json()

console.log(data.issues) // Array of issues
console.log(data.hasMore) // boolean
console.log(data.nextCursor) // string | null

// Pagination
if (data.hasMore) {
  const nextPage = await fetch(`/api/projects/123/issues?cursor=${data.nextCursor}`)
  const nextData = await nextPage.json()
}
```

## Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized
- `404` - Project not found
- `500` - Internal server error

### Status Validation

Invalid status values will return a 400 error:

```bash
# This will return an error
GET /api/projects/123/issues?statuses=invalid,new

# Response: 400 Bad Request
# "Invalid statuses: invalid. Valid statuses are: new, escalating, resolved, ignored"
```

## Performance Notes

- Uses database indexes for fast filtering
- Supports cursor-based pagination for large datasets
- Single SQL query with histogram subqueries
- Leverages BRIN indexes on date columns
