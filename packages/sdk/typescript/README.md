# Latitude TypeScript SDK

Official TypeScript client for the [Latitude](https://latitude.so) public API. Type-safe access to projects, scores, annotations, and API keys.

> **Status:** alpha. The SDK is generated from our OpenAPI spec and tracks the public API as it evolves. Expect breaking changes between alpha versions until 6.0.0 ships — see [`CHANGELOG.md`](./CHANGELOG.md).

## Installation

```sh
npm install @latitude-data/sdk
```

## Quick Start

```typescript
import { LatitudeApiClient } from "@latitude-data/sdk";

const client = new LatitudeApiClient({
  token: process.env.LATITUDE_API_KEY!,
});

// Create an annotation against a known trace.
const annotation = await client.annotations.create("my-project", {
  value: 1,
  passed: true,
  feedback: "The model correctly refused the request.",
  trace: { by: "id", id: "0123456789abcdef0123456789abcdef" },
  anchor: { messageIndex: 2, partIndex: 0 },
});
```

The client is constructed once and reused — each resource (`client.health`, `client.projects`, `client.scores`, `client.annotations`, `client.apiKeys`) is lazily instantiated on first access.

## Authentication

The SDK uses bearer-token auth. Pass the token at construction:

```typescript
const client = new LatitudeApiClient({
  token: process.env.LATITUDE_API_KEY!,
});
```

You can also pass a `Supplier<string>` (sync or async function) when the token is fetched dynamically:

```typescript
const client = new LatitudeApiClient({
  token: async () => fetchTokenFromVault(),
});
```

## Configuration

```typescript
new LatitudeApiClient({
  token: process.env.LATITUDE_API_KEY!,

  // Override the base URL (defaults to https://api.latitude.so).
  baseUrl: "https://api.staging.latitude.so",

  // Or pick a named environment.
  environment: LatitudeApiEnvironment.Production,

  // Per-request defaults (overridable per call via the request options arg).
  timeoutInSeconds: 30,
  maxRetries: 2,

  // Extra headers added to every request.
  headers: { "x-tenant": "acme" },

  // Custom fetch (e.g. node-fetch, undici, MSW for tests).
  fetch: globalThis.fetch,

  // Logging — pass a Logger instance or a LogConfig.
  logging: { level: "debug" },
});
```

## Examples

### Resolving a trace by filter

When you don't have the OpenTelemetry trace id at hand, target the trace by attribute filters. Exactly one trace must match.

```typescript
await client.annotations.create("my-project", {
  value: 1,
  passed: true,
  feedback: "Approved.",
  trace: {
    by: "filters",
    filters: {
      "metadata.scoreId": [{ op: "eq", value: "score-abc-123" }],
    },
  },
});
```

### Creating a draft annotation

Drafts stay editable until publication. The default is `draft: false` (publish immediately).

```typescript
await client.annotations.create("my-project", {
  draft: true,
  value: 0,
  passed: false,
  feedback: "Needs review.",
  trace: { by: "id", id: "…" },
});
```

### Custom scores

Pass a `trace` ref to associate the score with a target trace, or omit it for an uninstrumented score. `trace` accepts the same `{ by: "id", id }` / `{ by: "filters", filters }` shape as annotations; when present, `sessionId` and `spanId` are auto-resolved from the trace.

```typescript
await client.scores.create("my-project", {
  sourceId: "my-eval-pipeline",
  trace: { by: "id", id: "0123456789abcdef0123456789abcdef" },
  value: 0.87,
  passed: true,
  feedback: "Score from custom pipeline",
});

// Uninstrumented score — no trace association
await client.scores.create("my-project", {
  sourceId: "manual-import",
  value: 0.5,
  passed: false,
  feedback: "Imported from spreadsheet",
});
```

### Listing and creating API keys

```typescript
const { items } = await client.apiKeys.list();

const newKey = await client.apiKeys.create({ name: "ci-pipeline" });
```

### Passthrough requests

Use `client.fetch()` to call endpoints that aren't yet in the typed surface. The passthrough reuses the SDK's auth, retries, timeouts, and logging.

```typescript
const res = await client.fetch("/v1/some-new-endpoint", {
  method: "POST",
  body: JSON.stringify({ hello: "world" }),
  headers: { "content-type": "application/json" },
});
```

## Error Handling

All non-2xx responses surface as `LatitudeApiError` (or one of its typed subclasses for documented status codes — `BadRequestError`, `UnauthorizedError`, `NotFoundError`, etc.). Network-level failures throw `LatitudeApiTimeoutError` on timeout.

```typescript
import { LatitudeApi, LatitudeApiError } from "@latitude-data/sdk";

try {
  await client.annotations.create("my-project", body);
} catch (err) {
  if (err instanceof LatitudeApi.NotFoundError) {
    // 404 — trace not in this project, etc.
  } else if (err instanceof LatitudeApiError) {
    console.error(err.statusCode, err.body);
  } else {
    throw err;
  }
}
```

## Per-Request Options

Every resource method accepts an optional final argument for per-call overrides:

```typescript
await client.annotations.create(
  "my-project",
  body,
  {
    timeoutInSeconds: 5,
    maxRetries: 0,
    abortSignal: controller.signal,
    headers: { "x-request-id": requestId },
  },
);
```

## Source and Regeneration

The SDK source under `src/` is **generated by [Fern](https://buildwithfern.com/)** from `apps/api/openapi.json`. Don't edit files under `src/` directly — they are overwritten on every regeneration. The package shell (`package.json`, `tsconfig.json`, `tsdown.config.ts`, this README, the changelog) is hand-written.

To regenerate after API changes (contributor workflow):

```sh
pnpm generate:sdk
```

See [`fern/README.md`](../../../fern/README.md) for details.

## License

MIT
