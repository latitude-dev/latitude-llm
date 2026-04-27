# `@latitude-data/sdk` — TypeScript example

Minimal example that exercises the workspace-linked `@latitude-data/sdk`
against a running Latitude API — local or production. Covers three flows:

| Script | What it shows |
| --- | --- |
| `pnpm annotate:byTraceId` | `client.annotations.create` by explicit `trace.id` (published by default) |
| `pnpm annotate:draft` | Same, with `draft: true` — the server keeps `draftedAt` set until the publish job runs |
| `pnpm annotate:byFilter` | Resolve the trace by a `FilterSet` instead of an id (exactly one match required) |
| `pnpm apiKeys:list` | `client.apiKeys.list` — lists API keys for the org (tokens omitted from the list response) |

## Setup

From this directory:

```bash
cp .env.example .env
# then fill in LATITUDE_API_BASE_URL, LATITUDE_API_KEY, LATITUDE_PROJECT_SLUG,
# LATITUDE_TRACE_ID (and LATITUDE_SESSION_ID for the filter variant). The API
# key is already organization-scoped server-side — the SDK no longer takes
# an organization id anywhere.
```

### Running against local dev

Start the API locally (from the repo root):

```bash
pnpm --filter @app/api dev
```

Point the example at it:

```
LATITUDE_API_BASE_URL=http://localhost:3001
```

Generate a dev API key (from the root, one-liner via `curl`):

```bash
# Assuming you already have a dev user + organization seeded. If not, run
# `pnpm db:reset && pnpm seed` first.
curl -X POST http://localhost:3001/v1/api-keys \
  -H "Authorization: Bearer <existing-session-or-dev-key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "sdk-example"}'
```

Paste the returned `token` into `LATITUDE_API_KEY`.

`LATITUDE_TRACE_ID` must be an existing 32-char hex OpenTelemetry trace id
in the project. The quickest way to get one is to run any instrumented code
against the local API (e.g. a Claude Code invocation with
`@latitude-data/telemetry` configured), then copy a trace id from the traces
UI. Manually seeded traces in ClickHouse also work — see the contract tests
in `apps/api/src/routes/annotations.test.ts` for the shape.

### Running against production

```
LATITUDE_API_BASE_URL=https://api.latitude.so
```

Use an API key generated from the Latitude console.

## Build the SDK first

This example consumes `@latitude-data/sdk` via `workspace:*`, but the SDK's
`package.json` routes imports to `dist/*` — so the example needs a built SDK,
not just the TypeScript source. `workspace:*` only symlinks the package
directory; tsx/Node still resolves via `package.json.main` / `exports`.

Build once (and any time you regenerate the SDK after an API route change):

```bash
pnpm --filter @latitude-data/sdk build
```

Or if you just ran `pnpm generate:sdk` to regenerate from a spec change:

```bash
pnpm generate:sdk && pnpm --filter @latitude-data/sdk build
```

After that, the scripts below work — no rebuild needed between runs unless
the SDK source changes.

## Run

Each script can be invoked two ways — directly from this directory, or
through the workspace filter from the repo root (how you'd run it under
Turbo, in a CI job, or when you don't want to `cd`).

From this directory:

```bash
pnpm annotate:byTraceId   # by-id, published
pnpm annotate:draft       # by-id, draft
pnpm annotate:byFilter    # by-filter (requires LATITUDE_SESSION_ID)
pnpm apiKeys:list         # list API keys for the organization
```

From the repo root:

```bash
pnpm --filter @examples/sdk-typescript annotate:byTraceId
pnpm --filter @examples/sdk-typescript annotate:draft
pnpm --filter @examples/sdk-typescript annotate:byFilter
pnpm --filter @examples/sdk-typescript apiKeys:list
```

Both forms run `tsx --env-file=.env src/…`, which loads `.env` via Node's
built-in `--env-file` flag — so you don't need `dotenv` as a runtime dep.
Make sure your `.env` lives next to `package.json` in this directory
(that's where the script's `--env-file=.env` resolves from, regardless of
which cwd you ran the `pnpm --filter` command from).

## Typecheck

```bash
pnpm typecheck
```

Also runs automatically via the root `pnpm typecheck` turbo task, so
changes to this example are type-checked in CI.

## Troubleshooting

- **`Unauthorized` (401)**: `LATITUDE_API_KEY` is wrong or revoked.
- **`Trace not found` (404)** on the by-id flow: the trace doesn't belong to
  the project the API key's org owns — the API verifies ownership before
  writing.
- **`Multiple traces match the provided filters` (400)** on the by-filter
  flow: narrow the filter set. The API requires exactly one match.
- **Cannot find module `@latitude-data/sdk`**: run `pnpm install` from the
  repo root, then `pnpm --filter @latitude-data/sdk build` to populate
  `dist/` (the example imports the built output).
