# `latitude-sdk` — Python examples

Minimal examples that exercise the workspace `latitude-sdk` against a running
Latitude API — local or production. Python mirror of
[`packages/sdk/typescript/examples`](../../typescript/examples/README.md).

| Script | What it shows |
| --- | --- |
| `create_annotation.py` | `client.annotations.create` by explicit `trace` id (always published) |
| `create_annotation_by_filter.py` | Resolve the trace by a `FilterSet` instead of an id (exactly one match required) |
| `list_api_keys.py` | `client.api_keys.list` — lists API keys for the org (tokens masked in the list response) |

## Setup

From `packages/sdk/python`:

```bash
uv sync                # installs the SDK (editable) + dev deps into .venv
cp examples/.env.example examples/.env
# then fill in LATITUDE_API_KEY, LATITUDE_PROJECT_SLUG, LATITUDE_TRACE_ID
# (and LATITUDE_SESSION_ID for the filter variant). LATITUDE_API_BASE_URL
# is optional — unset means production.
```

The SDK is installed editable from `src/latitude_sdk` — no build step needed,
and regenerating the SDK (`pnpm generate:sdk`) is picked up immediately.

### Running against local dev

Start the API locally (from the repo root):

```bash
pnpm --filter @app/api dev
```

Point the examples at it:

```
LATITUDE_API_BASE_URL=http://localhost:3001
```

See the [TypeScript examples README](../../typescript/examples/README.md) for
how to generate a dev API key and find a trace id.

### Running against production

Leave `LATITUDE_API_BASE_URL` unset (or empty) — the SDK defaults to
`https://api.latitude.so`. Use an API key generated from the Latitude console.

## Run

From `packages/sdk/python`:

```bash
uv run --env-file examples/.env python examples/create_annotation.py
uv run --env-file examples/.env python examples/create_annotation_by_filter.py   # requires LATITUDE_SESSION_ID
uv run --env-file examples/.env python examples/list_api_keys.py
```

## Troubleshooting

- **`UnauthorizedError` (401)**: `LATITUDE_API_KEY` is wrong or revoked.
- **`NotFoundError` (404)** on the by-id flow: the trace doesn't belong to
  the project the API key's org owns — the API verifies ownership before
  writing.
- **`BadRequestError` (400)** on the by-filter flow: multiple traces match —
  narrow the filter set. The API requires exactly one match.
- **`ModuleNotFoundError: latitude_sdk`**: run `uv sync` from
  `packages/sdk/python` first, and invoke scripts through `uv run`.
