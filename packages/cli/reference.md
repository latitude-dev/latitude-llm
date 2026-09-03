# Latitude CLI Reference

Full command reference for `latitude`.

## Commands

- [`latitude account`](#latitude-account)
- [`latitude analytics`](#latitude-analytics)
- [`latitude annotations`](#latitude-annotations)
- [`latitude api-keys`](#latitude-api-keys)
- [`latitude datasets`](#latitude-datasets)
- [`latitude experiments`](#latitude-experiments)
- [`latitude imports`](#latitude-imports)
- [`latitude incidents`](#latitude-incidents)
- [`latitude members`](#latitude-members)
- [`latitude memory`](#latitude-memory)
- [`latitude monitors`](#latitude-monitors)
- [`latitude oauth-keys`](#latitude-oauth-keys)
- [`latitude projects`](#latitude-projects)
- [`latitude saved-searches`](#latitude-saved-searches)
- [`latitude scores`](#latitude-scores)
- [`latitude sessions`](#latitude-sessions)
- [`latitude signals`](#latitude-signals)
- [`latitude spans`](#latitude-spans)
- [`latitude tools`](#latitude-tools)
- [`latitude traces`](#latitude-traces)
- [`latitude users`](#latitude-users)

---

### `latitude account`

#### `latitude account bootstrap`

Creates a temporary organization with an API key and a project, and returns a link to claim ownership of it. Requires no authentication.

`POST /v1/account/bootstrap`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude account get`

Returns the caller's account snapshot: the organization the request is scoped to, plus the user record and their role when the request was made by a real user (OAuth). API-key callers receive `user: null` and `role: null` because API keys aren't tied to a specific user.

`GET /v1/account`

---

### `latitude analytics`

#### `latitude analytics query`

Compute a metric over a filtered stream (`traces`/`sessions`/`spans`), optionally broken down by a dimension and/or bucketed over time. Returns a tidy series — one point per breakdown value and/or time bucket — suitable for charts and dashboards.

`POST /v1/projects/{projectSlug}/analytics/query`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude annotations`

#### `latitude annotations create`

Creates a published annotation score against a target trace. The trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required). When called with an OAuth token, the annotation is attributed to the authenticated user.

`POST /v1/projects/{projectSlug}/annotations`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude api-keys`

#### `latitude api-keys create`

Generates a new API key for the organization. The token is only returned once — store it securely.

`POST /v1/api-keys`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude api-keys get`

Returns a single API key including the full unmasked `token`. Useful for retrieving a stored token by id without rotating it.

`GET /v1/api-keys/{apiKeyId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--api-key-id` | `string` | Yes | API-key identifier. |

#### `latitude api-keys list`

Returns all API keys for the organization. Tokens are not included in the list response.

`GET /v1/api-keys`

#### `latitude api-keys revoke`

Revokes an API key.

`DELETE /v1/api-keys/{apiKeyId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--api-key-id` | `string` | Yes | API-key identifier. |

#### `latitude api-keys update`

Renames an API key. The token itself is immutable — use create + revoke if you need a new value.

`PATCH /v1/api-keys/{apiKeyId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--api-key-id` | `string` | Yes | API-key identifier. |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude datasets`

#### `latitude datasets add-column`

Adds a custom column. The column starts empty on every row; rows are written only when a cell is filled, so the dataset version does not change.

`POST /v1/projects/{projectSlug}/datasets/{datasetSlug}/columns`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets create`

Creates an empty dataset in the project. The slug is derived from `name`.

`POST /v1/projects/{projectSlug}/datasets`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets delete`

Deletes a dataset by slug.

`DELETE /v1/projects/{projectSlug}/datasets/{datasetSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |

#### `latitude datasets delete-column`

Removes a column (built-in or custom) from the active schema. Its data is preserved and the column can be re-added; this does not change the dataset version.

`DELETE /v1/projects/{projectSlug}/datasets/{datasetSlug}/columns/{identifier}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--identifier` | `string` | Yes | Stable column identifier. |

#### `latitude datasets delete-rows`

Deletes rows matching the supplied selection.

`DELETE /v1/projects/{projectSlug}/datasets/{datasetSlug}/rows`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets export-rows`

Exports the selected rows as CSV. Returns one of three outcomes, discriminated by `status`:

- `"ready"` — the export fit in the synchronous path. Body carries a short-lived signed `downloadUrl` the caller follows with a plain HTTP GET.
- `"queued"` — the export was too large for the synchronous path AND a `recipient` was supplied. The CSV will be emailed to that address. The recipient must be a member of the requesting organization.
- `"too_large"` — the export was too large for the synchronous path AND no `recipient` was supplied. Body includes a `recommendedAction` describing how to recover (typically: ask the user for an email and retry with `recipient` set).

`POST /v1/projects/{projectSlug}/datasets/{datasetSlug}/rows/export`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets get`

Returns one dataset by slug.

`GET /v1/projects/{projectSlug}/datasets/{datasetSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |

#### `latitude datasets import-rows-from-traces`

Imports one row per trace matched by `traces`.

`POST /v1/projects/{projectSlug}/datasets/{datasetSlug}/rows/import/traces`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets insert-rows`

Appends one or more rows to the dataset.

`POST /v1/projects/{projectSlug}/datasets/{datasetSlug}/rows`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets list`

Returns a cursor-paginated page of datasets in the project.

`GET /v1/projects/{projectSlug}/datasets`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 200. |
| `--sort-by` | `name | updatedAt` | No | Field to sort by. Defaults to `updatedAt`. |
| `--sort-direction` | `asc | desc` | No | Sort direction. Defaults to `desc`. |

#### `latitude datasets list-columns`

Returns the ordered active column schema — the built-in columns plus any custom columns. Pass `includeRemoved=true` to also return soft-removed columns (so they can be restored).

`GET /v1/projects/{projectSlug}/datasets/{datasetSlug}/columns`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--include-removed` | `true | false` | No | When `true`, also returns soft-removed columns (each carrying `removed: true`). Defaults to `false`. |

#### `latitude datasets list-rows`

Returns a cursor-paginated page of rows.

`GET /v1/projects/{projectSlug}/datasets/{datasetSlug}/rows`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 200. |
| `--search` | `string` | No | Free-text search against row cells. |
| `--sort-direction` | `asc | desc` | No | Sort direction on `createdAt`. Defaults to `desc` (newest first). |

#### `latitude datasets reorder-columns`

Sets the left-to-right order of columns. This is a metadata edit and does not change the dataset version.

`POST /v1/projects/{projectSlug}/datasets/{datasetSlug}/columns/reorder`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets restore-column`

Restores a soft-removed column (built-in or custom) to the active schema, reconnecting its preserved data. Find removed identifiers via `listDatasetColumns` with `includeRemoved=true`.

`POST /v1/projects/{projectSlug}/datasets/{datasetSlug}/columns/{identifier}/restore`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--identifier` | `string` | Yes | Stable column identifier. |

#### `latitude datasets update`

Updates a dataset's `name` and/or `description`. Renaming regenerates the slug — clients should re-read the response or rely on the `id` for stable references.

`PATCH /v1/projects/{projectSlug}/datasets/{datasetSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets update-column`

Renames a column. Works for both built-in and custom columns.

`PATCH /v1/projects/{projectSlug}/datasets/{datasetSlug}/columns/{identifier}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--identifier` | `string` | Yes | Stable column identifier. |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude datasets update-row`

Partially updates a single row. Only the cells you send are changed; omitted cells keep their current value. Use this to fill in an `expectedOutput` (or any other cell) after rows were imported. Bumps the dataset version.

`PATCH /v1/projects/{projectSlug}/datasets/{datasetSlug}/rows/{rowId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--dataset-slug` | `string` | Yes | Dataset slug (human-readable identifier within the project). |
| `--row-id` | `string` | Yes | Stable row identifier (from `listDatasetRows`). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude experiments`

#### `latitude experiments create`

Creates an experiment. The slug is derived from `name`. Omit `variants` to seed two defaults.

`POST /v1/projects/{projectSlug}/experiments`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude experiments delete`

Deletes an experiment. Its slug becomes reusable.

`DELETE /v1/projects/{projectSlug}/experiments/{experimentSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--experiment-slug` | `string` | Yes | Experiment slug (human-readable identifier within the project). |

#### `latitude experiments get`

Returns a single experiment plus its comparison: per-variant metrics, deltas vs the baseline, and population-deviation flags.

`GET /v1/projects/{projectSlug}/experiments/{experimentSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--experiment-slug` | `string` | Yes | Experiment slug (human-readable identifier within the project). |

#### `latitude experiments list`

Returns the project's experiments with cheap summary metrics (variant count, distinct sessions and users across all variant populations). Excludes per-variant comparison metrics — fetch a single experiment for those.

`GET /v1/projects/{projectSlug}/experiments`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 100. |
| `--search` | `string` | No | Filter by name (case-insensitive substring). |

#### `latitude experiments update`

Replaces an experiment's mutable fields. `variants`, when supplied, fully replaces the array (each variant carries its own `baseline` flag). Renaming may regenerate the slug.

`PUT /v1/projects/{projectSlug}/experiments/{experimentSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--experiment-slug` | `string` | Yes | Experiment slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude imports`

#### `latitude imports cancel`

Cancels an import that has not finished. Traces already imported are kept, and the import can be retried later.

`POST /v1/projects/{projectSlug}/imports/{importId}/cancel`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--import-id` | `string` | Yes | Import id. |

#### `latitude imports create`

Imports historical traces from another observability platform into the project. The import runs in the background, newest traces first.

`POST /v1/projects/{projectSlug}/imports`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude imports get`

Returns a single import, including its recent run history.

`GET /v1/projects/{projectSlug}/imports/{importId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--import-id` | `string` | Yes | Import id. |

#### `latitude imports list`

Returns the project's imports from other observability platforms, newest first. Excludes the run history — fetch a single import for that.

`GET /v1/projects/{projectSlug}/imports`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |

#### `latitude imports retry`

Retries a failed, cancelled, or capped import from where it stopped, as a new import that runs in the background. Credentials must be provided again and match the original's region.

`POST /v1/projects/{projectSlug}/imports/{importId}/retry`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--import-id` | `string` | Yes | Import id. |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude incidents`

#### `latitude incidents list`

Returns incidents in the project, ordered from oldest to newest. The time window defaults to the trailing 7 days.

`GET /v1/projects/{projectSlug}/incidents`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time window. Returns incidents whose lifetime overlaps `[fromIso, toIso]`. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time window. Defaults to now. |
| `--source-type` | `monitor | signal` | No | Restrict to incidents triggered by this source type: `monitor` or `signal`. |
| `--source-id` | `string` | No | Restrict to incidents tied to one source entity id. |
| `--severities` | `low | medium | high | urgent[]` | No | Restrict to incidents whose severity matches any value in this list. |

#### `latitude incidents resolve`

Resolves (closes) an ongoing incident. An already-closed incident is returned unchanged. If the incident's condition triggers again, a new incident will be opened.

`POST /v1/projects/{projectSlug}/incidents/{incidentId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--incident-id` | `string` | Yes | Incident identifier. |

---

### `latitude members`

#### `latitude members get`

Returns a single member of the caller's organization, including their role and user details.

`GET /v1/members/{memberId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--member-id` | `string` | Yes | Membership identifier. |

#### `latitude members invite`

Signals an invitation to join the caller's organization. The invitee receives an accept link by email and becomes a member once they accept. The response is the pending invitation record. Requires OAuth authentication (API-key callers can't act on behalf of a specific user).

`POST /v1/members`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude members list`

Returns every active member of the caller's organization with their role and user details.

`GET /v1/members`

#### `latitude members remove`

Removes a member from the caller's organization. Self-removal and removing the organization owner are rejected — transfer ownership first. Requires OAuth authentication.

`DELETE /v1/members/{memberId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--member-id` | `string` | Yes | Membership identifier. |

#### `latitude members update`

Updates a member of the caller's organization. Today only the role is mutable. The caller must be an admin or owner; owners cannot be demoted via this endpoint. Requires OAuth authentication.

`PATCH /v1/members/{memberId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--member-id` | `string` | Yes | Membership identifier. |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude memory`

#### `latitude memory get-record`

Returns one record's current body plus its mutating version history (newest first), each version carrying the authoring span/trace/session/user and per-version token deltas.

`GET /v1/projects/{projectSlug}/memory/record`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--store-id` | `string` | Yes | Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store. |
| `--record-id` | `string` | Yes | Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record. |

#### `latitude memory get-record-change`

Returns the before/after bodies for one change — the version authored by `spanId` against its predecessor in the record's mutating chain. Returns 404 when the span is not a recorded change of the record.

`GET /v1/projects/{projectSlug}/memory/record/change`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--store-id` | `string` | Yes | Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store. |
| `--record-id` | `string` | Yes | Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record. |
| `--span-id` | `string` | Yes | Span that authored the change (the `after` side). |

#### `latitude memory get-store`

Returns the store's current records (ids, token counts, last-updated) as a snapshot. Pass `at` (ISO-8601) to reconstruct the store as of a past point in time. Record bodies are fetched separately, one record at a time.

`GET /v1/projects/{projectSlug}/memory/store`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--store-id` | `string` | Yes | Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store. |
| `--at` | `string (date-time)` | No | Reconstruct the store as of this ISO-8601 timestamp. Defaults to the current state. |

#### `latitude memory get-store-diff`

Returns a per-record diff of the store between two points in time — added, updated, and removed records with token deltas. `from` defaults to the empty state (everything counts as added); `to` defaults to the current state. Unchanged records are pruned.

`GET /v1/projects/{projectSlug}/memory/store/diff`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--store-id` | `string` | Yes | Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store. |
| `--from` | `string (date-time)` | No | Lower bound (inclusive) of the diff, ISO-8601. Defaults to the empty state. |
| `--to` | `string (date-time)` | No | Upper bound (inclusive) of the diff, ISO-8601. Defaults to the current state. |

#### `latitude memory list-record-reads`

Returns the retrieval (`search_memory`) events for one record, newest first and capped, each with the query text (when captured), tokens returned, and the accessing span/trace/session/user.

`GET /v1/projects/{projectSlug}/memory/record/reads`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--store-id` | `string` | Yes | Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store. |
| `--record-id` | `string` | Yes | Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record. |
| `--limit` | `integer` | No | Maximum number of read events to return. Capped at 200. |

#### `latitude memory list-record-users`

Returns the end-users who accessed one record with per-user read and write counts, most recent access first. Capped at the 1000 most recent accessors.

`GET /v1/projects/{projectSlug}/memory/record/users`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--store-id` | `string` | Yes | Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store. |
| `--record-id` | `string` | Yes | Record identifier (`gen_ai.memory.record.id`). Pass an empty string to address the unnamed record. |

#### `latitude memory list-store-users`

Returns the end-users who accessed the store (reads and writes both count as access), most recent access first. Capped at the 1000 most recent accessors.

`GET /v1/projects/{projectSlug}/memory/store/users`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--store-id` | `string` | Yes | Store identifier (`gen_ai.memory.store.id`). Pass an empty string to address the unattributed ("") store. |

#### `latitude memory list-stores`

Returns a cursor-paginated page of the project's memory stores, one roll-up row each (record count, tokens, last-updated, sessions, users). A store groups records under `gen_ai.memory.store.id`; the empty-string store is the unattributed bucket.

`GET /v1/projects/{projectSlug}/memory/stores`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 200. |
| `--sort` | `lastUpdated | lastRead | records | tokens | sessions | users` | No | Field to sort by. Defaults to `lastUpdated` (most recently written first). |
| `--direction` | `asc | desc` | No | Sort direction. Defaults to `desc`. |

---

### `latitude monitors`

#### `latitude monitors create`

Creates a monitor with one rule. The slug is derived from `name`.

`POST /v1/projects/{projectSlug}/monitors`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude monitors delete`

Deletes a monitor. System monitors cannot be deleted.

`DELETE /v1/projects/{projectSlug}/monitors/{monitorSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--monitor-slug` | `string` | Yes | Monitor slug (human-readable identifier within the project). |

#### `latitude monitors get`

Returns a single monitor by slug.

`GET /v1/projects/{projectSlug}/monitors/{monitorSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--monitor-slug` | `string` | Yes | Monitor slug (human-readable identifier within the project). |

#### `latitude monitors list`

Returns the project's monitors, system monitors first, then by most recent activity.

`GET /v1/projects/{projectSlug}/monitors`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 100. |
| `--search` | `string` | No | Filter by name (case-insensitive substring). |

#### `latitude monitors list-for-target`

Returns live monitors matching the supplied target type and/or filter subset.

`POST /v1/projects/{projectSlug}/monitors/for-target`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude monitors list-incidents`

Returns the incidents opened by a monitor, most recent first. Each item's `notified` flag shows whether it triggered a notification.

`GET /v1/projects/{projectSlug}/monitors/{monitorSlug}/incidents`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--monitor-slug` | `string` | Yes | Monitor slug (human-readable identifier within the project). |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 100. |

#### `latitude monitors mute`

Mutes a monitor so its incidents stop sending notifications. Allowed on all monitors.

`POST /v1/projects/{projectSlug}/monitors/{monitorSlug}/mute`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--monitor-slug` | `string` | Yes | Monitor slug (human-readable identifier within the project). |

#### `latitude monitors unmute`

Lifts a monitor's mute so its incidents notify again.

`POST /v1/projects/{projectSlug}/monitors/{monitorSlug}/unmute`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--monitor-slug` | `string` | Yes | Monitor slug (human-readable identifier within the project). |

#### `latitude monitors update`

Updates a monitor's metadata and incident severity. Target, trigger, metric, and conditions are fixed after creation. System monitor edits are restricted.

`PATCH /v1/projects/{projectSlug}/monitors/{monitorSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--monitor-slug` | `string` | Yes | Monitor slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude oauth-keys`

#### `latitude oauth-keys get`

Returns a single OAuth key (like MCP clients) by id.

`GET /v1/oauth-keys/{oauthKeyId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--oauth-key-id` | `string` | Yes | OAuth key identifier. |

#### `latitude oauth-keys list`

Returns every OAuth key (like MCP clients) connected to the organization.

`GET /v1/oauth-keys`

#### `latitude oauth-keys revoke`

Revokes an OAuth key (like MCP clients). The connected client immediately loses access.

`DELETE /v1/oauth-keys/{oauthKeyId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--oauth-key-id` | `string` | Yes | OAuth key identifier. |

---

### `latitude projects`

#### `latitude projects create`

Creates a new project within the organization. The name must be unique within the org.

`POST /v1/projects`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude projects delete`

Deletes a project by slug.

`DELETE /v1/projects/{projectSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |

#### `latitude projects get`

Returns a single project by slug.

`GET /v1/projects/{projectSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |

#### `latitude projects list`

Returns every project in the organization. The response uses the standard paginated shape; the project list currently fits in a single page (`nextCursor` is always `null`).

`GET /v1/projects`

#### `latitude projects update`

Updates a project's name and/or settings. Renaming never changes the slug, and the slug cannot be changed via the API (only from the dashboard). Use `id` or `slug` as stable references.

`PATCH /v1/projects/{projectSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude saved-searches`

#### `latitude saved-searches create`

Creates a saved search within the project. At least one of `query` or `filters` must be set. The slug is derived from `name`. OAuth-authenticated only.

`POST /v1/projects/{projectSlug}/searches`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude saved-searches delete`

Deletes a saved search by slug.

`DELETE /v1/projects/{projectSlug}/searches/{searchSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--search-slug` | `string` | Yes | Saved-search slug (human-readable identifier within the project). |

#### `latitude saved-searches get`

Returns a single saved search by slug.

`GET /v1/projects/{projectSlug}/searches/{searchSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--search-slug` | `string` | Yes | Saved-search slug (human-readable identifier within the project). |

#### `latitude saved-searches list`

Returns every saved search in the project. The response uses the standard paginated shape; the saved-search list currently fits in a single page (`nextCursor` is always `null`).

`GET /v1/projects/{projectSlug}/searches`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |

#### `latitude saved-searches list-traces`

Returns a cursor-paginated page of traces that match the saved search's `query` + `filters`. Each row uses the same `Trace` shape as `listTraces` — use the trace point-lookup endpoints (`getTrace`, `listTraceSpans`, `getTraceSpan`, `listTraceAnnotations`) to drill into individual traces.

`GET /v1/projects/{projectSlug}/searches/{searchSlug}/traces`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--search-slug` | `string` | Yes | Saved-search slug (human-readable identifier within the project). |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 200. |
| `--sort-by` | `relevance | startTime | endTime | durationNs | tokensTotal | costTotalMicrocents` | No | Field to sort by. Defaults to `startTime`. Pass `relevance` to rank by semantic match against the saved search's query (best match first, then most recent). |
| `--sort-direction` | `asc | desc` | No | Sort direction. Defaults to `desc` (most recent first). |

#### `latitude saved-searches update`

Updates a saved search. Renaming may regenerate the slug — clients should re-read the response or rely on the `id` for stable references.

`PATCH /v1/projects/{projectSlug}/searches/{searchSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--search-slug` | `string` | Yes | Saved-search slug (human-readable identifier within the project). |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude scores`

#### `latitude scores create`

Creates a score against a target trace. The trace is resolved by explicit id (`trace.by = "id"`) or by a filter set (`trace.by = "filters"`, exactly one match required). Annotations use the separate `/annotations` endpoint.

`POST /v1/projects/{projectSlug}/scores`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude sessions`

#### `latitude sessions analytics`

Returns session analytics for the project: a total (or median) per metric over the requested range, plus a per-bucket series for each metric. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.

`GET /v1/projects/{projectSlug}/sessions/analytics`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |

#### `latitude sessions get`

Returns a single session by id, including its `conversation`: the system instructions and the messages of the session's latest LLM completion, in OpenTelemetry GenAI format.

`GET /v1/projects/{projectSlug}/sessions/{sessionId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--session-id` | `string` | Yes | Session identifier lifted from instrumentation. Up to 128 characters. |

#### `latitude sessions get-memory`

Returns the session's memory footprint: per-record read, added, and removed token metrics plus session-wide totals. Pass `traceId` to restrict the footprint to a single trace of the session.

`GET /v1/projects/{projectSlug}/sessions/{sessionId}/memory`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--session-id` | `string` | Yes | Session identifier lifted from instrumentation. Up to 128 characters. |
| `--trace-id` | `string` | No | Restrict the memory footprint to this trace of the session. Omit for the whole session. |

#### `latitude sessions get-memory-changes`

Returns the memory writes the session made as per-record before/after diffs. Pass `traceId` to restrict to a single trace of the session.

`GET /v1/projects/{projectSlug}/sessions/{sessionId}/memory/changes`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--session-id` | `string` | Yes | Session identifier lifted from instrumentation. Up to 128 characters. |
| `--trace-id` | `string` | No | Restrict the memory changes to this trace of the session. Omit for the whole session. |

#### `latitude sessions get-signal`

Returns one signal by slug, including its `scoreEvidence` and occurrence stats scoped to the session. Returns 404 when the signal has no occurrences in the session.

`GET /v1/projects/{projectSlug}/sessions/{sessionId}/signals/{signalSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--session-id` | `string` | Yes | Session identifier lifted from instrumentation. Up to 128 characters. |
| `--signal-slug` | `string` | Yes | Signal slug. |

#### `latitude sessions list`

Returns a cursor-paginated page of sessions in the project. A session groups the traces of one conversation. Combine `filters` with `query` (free-text semantic search) to narrow the result set. Session list rows exclude per-message LLM content — use `getSession` for the conversation view.

`POST /v1/projects/{projectSlug}/sessions/list`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude sessions list-signals`

Returns the signals that occurred in the session, including each signal's `scoreEvidence` and occurrence stats scoped to the session's traces. Ordered by most recent occurrence first.

`GET /v1/projects/{projectSlug}/sessions/{sessionId}/signals`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--session-id` | `string` | Yes | Session identifier lifted from instrumentation. Up to 128 characters. |

#### `latitude sessions list-traces`

Returns a cursor-paginated page of the traces that belong to the session. Rows match the trace list shape and exclude per-message LLM content — use `getTrace` for the full conversation view.

`GET /v1/projects/{projectSlug}/sessions/{sessionId}/traces`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--session-id` | `string` | Yes | Session identifier lifted from instrumentation. Up to 128 characters. |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 200. |
| `--sort-by` | `startTime | endTime | durationNs | tokensTotal | costTotalMicrocents` | No | Field to sort by. Defaults to `startTime`. |
| `--sort-direction` | `asc | desc` | No | Sort direction. Defaults to `desc` (most recent first). |

---

### `latitude signals`

#### `latitude signals analytics`

Returns signal analytics for the project: counts of ongoing, new, and escalating signals, plus total occurrences and a per-bucket occurrence series. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.

`GET /v1/projects/{projectSlug}/signals/analytics`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |

#### `latitude signals create`

Creates a user-defined signal with its membership detector — from `settings` (a `judge` LLM detector or a deterministic `rule`), or a raw `script` (advanced). The script is validated at save time (422 on a compile error). Detectors collect forward from creation; there is no historical backfill.

`POST /v1/projects/{projectSlug}/signals`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals delete`

Soft-deletes a signal and archives its detector so it stops matching new traces. Existing scores are retained but excluded from reads; the slug becomes reusable.

`DELETE /v1/projects/{projectSlug}/signals/{signalSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--signal-slug` | `string` | Yes | Signal slug. |

#### `latitude signals export`

Enqueues an asynchronous CSV export. The response returns immediately; the download link is emailed to `recipient` when the file is ready. The recipient must be a member of the requesting organization.

`POST /v1/projects/{projectSlug}/signals/export`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals get`

Returns the full-history detail view of one signal, including its `scoreEvidence`, lifecycle `states`, lifetime activity stats, occurrence trend, active evaluations, and current monitoring state.

`GET /v1/projects/{projectSlug}/signals/{signalSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--signal-slug` | `string` | Yes | Signal slug. |

#### `latitude signals ignore`

Marks each signal in `signalIds` as ignored, archiving it. Monitoring is stopped and notifications are also muted.

`POST /v1/projects/{projectSlug}/signals/ignore`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals list`

Returns a cursor-paginated page of signals in the project. Each item includes its `scoreEvidence`, lifecycle `states`, and time-window stats: `firstSeenAt`, `lastSeenAt`, `occurrences`, `affectedSessionsPercent`, `trend`, and `tags`.

`GET /v1/projects/{projectSlug}/signals`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 200. |
| `--query` | `string` | No | Free-text semantic search across the signals' names and descriptions. |
| `--lifecycle-group` | `active | archived` | No | `"active"` for signals that are neither resolved nor ignored; `"archived"` for resolved or ignored signals. Omit to include both. |
| `--sort-by` | `lastSeen | occurrences | state` | No | Sort field. `lastSeen` orders by most recent occurrence; `occurrences` by total count in the time window; `state` by lifecycle priority. |
| `--sort-direction` | `asc | desc` | No | Sort direction. Defaults to `desc`. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time window. Defaults to ~6 days ago. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time window. Defaults to now. |

#### `latitude signals list-traces`

Returns the page of distinct traces that contributed at least one occurrence of the signal, ordered by most recent activity first.

`GET /v1/projects/{projectSlug}/signals/{signalSlug}/traces`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--signal-slug` | `string` | Yes | Signal slug. |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 200. |

#### `latitude signals monitor`

Starts (or realigns) monitoring for the signal. When the signal has no active evaluation, a new one is generated. When an active evaluation exists, the call realigns it. The work runs asynchronously and the response returns immediately. Returns 400 when monitoring is already in progress for this signal.

`POST /v1/projects/{projectSlug}/signals/{signalSlug}/monitor`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--signal-slug` | `string` | Yes | Signal slug. |

#### `latitude signals mute`

Silences notifications for each signal in `signalIds`. Muted signals keep tracking occurrences and opening incidents; only notifications stop.

`POST /v1/projects/{projectSlug}/signals/mute`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals resolve`

Marks each signal in `signalIds` as resolved, archiving it and re-enabling its notifications. Unless `keepMonitoring` is `false`, linked evaluations keep running so a new occurrence reopens the signal as regressed.

`POST /v1/projects/{projectSlug}/signals/resolve`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals submit-feedback`

Records a one-time verdict on whether a flagger-detected signal is a real problem, with an optional reason. Only signals a flagger detected accept feedback, and feedback cannot be changed once submitted.

`POST /v1/projects/{projectSlug}/signals/{signalSlug}/feedback`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--signal-slug` | `string` | Yes | Signal slug. |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals trend`

Returns the occurrence histogram for one signal over `[fromIso, toIso]`. The default range is the trailing 14 days. Buckets are 12-hour wide and UTC-aligned.

`GET /v1/projects/{projectSlug}/signals/{signalSlug}/trend`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--signal-slug` | `string` | Yes | Signal slug. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive). Defaults to ~14 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive). Defaults to now. |

#### `latitude signals unignore`

Returns each signal in `signalIds` to the active list and re-enables its notifications.

`POST /v1/projects/{projectSlug}/signals/unignore`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals unmonitor`

Stops monitoring the signal. Idempotent — signals that aren't being monitored return 204 without changing anything.

`POST /v1/projects/{projectSlug}/signals/{signalSlug}/unmonitor`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--signal-slug` | `string` | Yes | Signal slug. |

#### `latitude signals unmute`

Re-enables notifications for each signal in `signalIds`.

`POST /v1/projects/{projectSlug}/signals/unmute`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals unresolve`

Reopens each signal in `signalIds` without marking it as regressed, re-enabling its notifications.

`POST /v1/projects/{projectSlug}/signals/unresolve`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude signals update`

Updates a signal's name, description, and evaluation pre-gate `filters`. Filter changes apply forward-only — existing membership is never re-evaluated. The slug is stable.

`PATCH /v1/projects/{projectSlug}/signals/{signalSlug}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--signal-slug` | `string` | Yes | Signal slug. |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude spans`

#### `latitude spans query`

Returns a cursor-paginated page of spans across all traces in the project matching `filters` (and an optional time `range`). The span-grain, row-level complement to `queryAnalytics` with `stream: "spans"` (which returns aggregates): use this to drill from an aggregate into the individual spans behind it — e.g. every failing `search_docs` tool span, or the slowest embedding calls.

`POST /v1/projects/{projectSlug}/spans/query`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

---

### `latitude tools`

#### `latitude tools co-occurrence`

Returns other tools called in the same traces as this one, ranked by shared trace count.

`GET /v1/projects/{projectSlug}/tools/{toolName}/co-occurrence`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--tool-name` | `string` | Yes | Tool name. URL-encode names containing special characters. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--limit` | `integer` | No | Maximum number of tools to return. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to failed calls only. |

#### `latitude tools context`

Returns where the tool is used, broken down by a dimension: `model` and `provider` attribute the tool's traces via their chat spans; `tag` reads tags on the tool-call spans themselves.

`GET /v1/projects/{projectSlug}/tools/{toolName}/context`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--tool-name` | `string` | Yes | Tool name. URL-encode names containing special characters. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--dimension` | `model | provider | tag` | Yes | Dimension to break the usage down by. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to failed calls only. |

#### `latitude tools errors`

Returns the most common error outputs of the tool's failed calls, grouped into clusters by a normalized form so variable fragments don't split one error into many buckets.

`GET /v1/projects/{projectSlug}/tools/{toolName}/errors`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--tool-name` | `string` | Yes | Tool name. URL-encode names containing special characters. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--limit` | `integer` | No | Maximum number of clusters to return. |

#### `latitude tools get`

Returns the latest definition seen for the tool plus its global usage metrics. Pass `errorsOnly=true` to also include failed-calls-only metrics for failure analysis.

`GET /v1/projects/{projectSlug}/tools/{toolName}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--tool-name` | `string` | Yes | Tool name. URL-encode names containing special characters. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to failed calls only. |

#### `latitude tools histogram`

Returns per-bucket call counts over the range. Omit `toolName` to aggregate across every tool in the project; pass it to scope the histogram to a single tool.

`GET /v1/projects/{projectSlug}/tools/histogram`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--tool-name` | `string` | No | Tool name. URL-encode names containing special characters. |
| `--bucket-seconds` | `integer` | No | Bucket width in seconds. Derived from the range (~30 buckets) when omitted. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to failed calls only. |

#### `latitude tools list`

Returns every tool in the project over the range — the union of defined and called tools — with per-tool usage metrics, offered counts, a call trend, and project-wide totals. The range defaults to the trailing 7 days.

`GET /v1/projects/{projectSlug}/tools`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--trend-bucket-seconds` | `integer` | No | Bucket width in seconds. Derived from the range (~30 buckets) when omitted. |

#### `latitude tools list-calls`

Returns a cursor-paginated page of the tool's most recent calls, newest first, with payloads truncated to a bounded preview. Use a span point-lookup for full payloads.

`GET /v1/projects/{projectSlug}/tools/{toolName}/calls`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--tool-name` | `string` | Yes | Tool name. URL-encode names containing special characters. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 50. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to failed calls only. |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |

#### `latitude tools parameters`

Returns the most common top-level input keys and their most common values for the tool, computed over a sample of the most recent calls in the range.

`GET /v1/projects/{projectSlug}/tools/{toolName}/parameters`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--tool-name` | `string` | Yes | Tool name. URL-encode names containing special characters. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--top-keys` | `integer` | No | Maximum number of keys to return. |
| `--top-values-per-key` | `integer` | No | Maximum number of values to return per key. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to failed calls only. |

---

### `latitude traces`

#### `latitude traces analytics`

Returns trace analytics for the project: a total (or median) per metric over the requested range, plus a per-bucket series for each metric. Buckets are 12-hour UTC-aligned. The range defaults to the trailing 7 days.

`GET /v1/projects/{projectSlug}/traces/analytics`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 7 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |

#### `latitude traces export`

Enqueues a CSV export of the traces matched by `traces`. The export runs asynchronously; a download link is emailed to `recipient` when the file is ready. The response returns immediately with `status = "queued"`. The recipient must already be a member of the requesting organization.

`POST /v1/projects/{projectSlug}/traces/export`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude traces get`

Returns a single trace by id, including its `conversation`: the system instructions and the messages of the trace's last LLM-completion span, in OpenTelemetry GenAI format.

`GET /v1/projects/{projectSlug}/traces/{traceId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--trace-id` | `string` | Yes | 32-character trace identifier. |

#### `latitude traces get-annotation`

Returns one annotation by id pinned to the trace.

`GET /v1/projects/{projectSlug}/traces/{traceId}/annotations/{annotationId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--trace-id` | `string` | Yes | 32-character trace identifier. |
| `--annotation-id` | `string` | Yes | Stable annotation identifier. |

#### `latitude traces get-memory`

Returns the trace's memory footprint: per-record read, added, and removed token metrics plus totals, scoped to this trace.

`GET /v1/projects/{projectSlug}/traces/{traceId}/memory`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--trace-id` | `string` | Yes | 32-character trace identifier. |

#### `latitude traces get-memory-changes`

Returns the memory writes the trace made as per-record before/after diffs, scoped to this trace.

`GET /v1/projects/{projectSlug}/traces/{traceId}/memory/changes`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--trace-id` | `string` | Yes | 32-character trace identifier. |

#### `latitude traces get-span`

Returns one span by id, including the LLM conversation (system instructions, input messages, output messages), tool data (definitions, call id, input, output), and the full OpenTelemetry payload (attributes, resource, events, links) that's excluded from the lighter list shape.

`GET /v1/projects/{projectSlug}/traces/{traceId}/spans/{spanId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--trace-id` | `string` | Yes | 32-character trace identifier. |
| `--span-id` | `string` | Yes | 16-character span identifier. |

#### `latitude traces list`

Returns a cursor-paginated page of traces in the project. Combine `filters` with `query` (free-text semantic search) to narrow the result set. Trace list rows exclude per-message LLM content — use `getTrace` for the full conversation view.

`POST /v1/projects/{projectSlug}/traces/list`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--json` | `JSON` | Yes | Request body as JSON (or use individual body-field flags) |

#### `latitude traces list-annotations`

Returns a cursor-paginated page of annotations pinned to the trace, including both published annotations and drafts.

`GET /v1/projects/{projectSlug}/traces/{traceId}/annotations`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--trace-id` | `string` | Yes | 32-character trace identifier. |
| `--cursor` | `string` | No | Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page. |
| `--limit` | `integer` | No | Page size. Defaults to 50; max 200. |

#### `latitude traces list-spans`

Returns every span belonging to the trace, ordered by `startTime` ascending. Spans carry the OpenTelemetry envelope (kind, status, attributes, resource) plus Latitude's GenAI enrichment (tokens, cost, operation, provider, model). Per-message LLM content is excluded for size; use a span point-lookup for the conversation payload.

`GET /v1/projects/{projectSlug}/traces/{traceId}/spans`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--trace-id` | `string` | Yes | 32-character trace identifier. |

---

### `latitude users`

#### `latitude users activity`

Returns the end-user's per-bucket session activity across the range, oldest first. The range defaults to the trailing 30 days.

`GET /v1/projects/{projectSlug}/users/{userId}/activity`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--user-id` | `string` | Yes | End-user identifier. URL-encode values containing special characters. |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 30 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to errored traces only. |

#### `latitude users behaviours`

Returns the behaviour clusters observed on the end-user's sessions, most frequent first. Counts are scoped to the user; cluster identity comes from the project taxonomy.

`GET /v1/projects/{projectSlug}/users/{userId}/behaviours`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--user-id` | `string` | Yes | End-user identifier. URL-encode values containing special characters. |
| `--limit` | `integer` | No | Maximum number of behaviours to return. |

#### `latitude users get`

Returns the lifetime profile of one end-user — trace, session, token, cost, and activity rollups across all of the user's traces (not range-bound).

`GET /v1/projects/{projectSlug}/users/{userId}`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--user-id` | `string` | Yes | End-user identifier. URL-encode values containing special characters. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to errored traces only. |

#### `latitude users list`

Returns a page of the project's identified end-users over the range, each with trace, session, token, and cost metrics, plus cost aggregates across every matching user. The range defaults to the trailing 30 days.

`GET /v1/projects/{projectSlug}/users`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 30 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |
| `--limit` | `integer` | No | Page size. Max 100. |
| `--offset` | `integer,null` | No | Zero-based offset of the first user to return. |
| `--sort-by` | `lastSeen | firstSeen | traces | sessions | errors | tokens | cost | costAvg | costMedian` | No | Field to sort by. Defaults to most recently seen. |
| `--sort-direction` | `asc | desc` | No | Sort direction. Defaults to descending. |
| `--search-query` | `string` | No | Case-insensitive substring match on the user's id or email. |

#### `latitude users memory-stores`

Returns the memory stores the end-user accessed (reads and writes both count as access), most recent access first. Capped at the 1000 most recent stores. Each store links to the memory browsing operations under the `memory` group.

`GET /v1/projects/{projectSlug}/users/{userId}/memory`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--user-id` | `string` | Yes | End-user identifier. URL-encode values containing special characters. |

#### `latitude users overview`

Returns project-wide end-user aggregates over the range — unique and new users, identified vs total traces and sessions — plus a per-bucket activity histogram. The range defaults to the trailing 30 days.

`GET /v1/projects/{projectSlug}/users/overview`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--from-iso` | `string (date-time)` | No | Lower bound (inclusive) of the time range. Defaults to 30 days before `toIso`. |
| `--to-iso` | `string (date-time)` | No | Upper bound (inclusive) of the time range. Defaults to now. |

#### `latitude users signals`

Returns the signals that occurred on the end-user's traces, most recent occurrence first. Occurrence counts are scoped to the user; signal identity and lifecycle states are the project's.

`GET /v1/projects/{projectSlug}/users/{userId}/signals`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--user-id` | `string` | Yes | End-user identifier. URL-encode values containing special characters. |
| `--limit` | `integer` | No | Maximum number of signals to return. |

#### `latitude users usage`

Returns the end-user's top values of a usage dimension — `model`, `provider`, or `tool` — ranked by distinct trace count.

`GET /v1/projects/{projectSlug}/users/{userId}/usage`

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--project-slug` | `string` | Yes | Project slug (human-readable identifier) |
| `--user-id` | `string` | Yes | End-user identifier. URL-encode values containing special characters. |
| `--dimension` | `model | provider | tool` | Yes | Dimension to break the usage down by. |
| `--limit` | `integer` | No | Maximum number of values to return. |
| `--errors-only` | `true | false` | No | When `true`, scope every aggregate to errored traces only. |

---

## Global flags

These flags are available on every command:

| Flag | Description |
|------|-------------|
| `--dry-run` | Print the HTTP request without sending it |
| `--json <JSON\|->` | Supply the request body as JSON (or `-` for stdin) |
| `--params <JSON>` | Merge extra parameters as JSON |
| `--format <json\|table\|yaml\|csv>` | Output format (default: `json`) |
| `--output <PATH>` | Write binary responses to a file |
| `--base-url <URL>` | Override the API base URL |
| `--page-all` | Auto-paginate and stream all results |
| `--page-limit <N>` | Max pages to fetch (default: `10`) |
| `-q, --quiet` | Suppress stdout on success |
| `-h, --help` | Print help |
| `-V, --version` | Print version |

