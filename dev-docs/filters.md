# Filter DSL

Universal filter representation used across the Latitude platform to serialize, transport, and translate filters into SQL.

## Core Types

Defined in `packages/domain/shared/src/filter.ts`, exported from `@domain/shared`.

### FilterSet

A field-keyed object where each key maps to an array of conditions. All conditions within a field are AND'd together, and all fields are AND'd across each other.

```json
{
  "status": [{ "op": "in", "value": ["error"] }],
  "cost": [{ "op": "gte", "value": 10 }, { "op": "lte", "value": 500 }],
  "metadata.env": [{ "op": "eq", "value": "production" }]
}
```

```typescript
type FilterSet = Readonly<Record<string, readonly FilterCondition[]>>
```

### FilterCondition

```typescript
interface FilterCondition {
  readonly op: FilterOperator
  readonly value: string | number | boolean | readonly (string | number)[]
}
```

### Operators

10 operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`, `notContains`.

- **Scalar comparisons** (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`) — map to SQL `=`, `!=`, `>`, `>=`, `<`, `<=`
- **Set membership** (`in`, `notIn`) — map to SQL `IN` / `NOT IN` for scalar columns, `hasAny()` / `NOT hasAny()` for array columns
- **Substring match** (`contains`, `notContains`) — map to SQL `ILIKE` / `NOT ILIKE` with auto-wrapped `%` wildcards

### Validation

`filterSetSchema` (Zod) enforces size limits at API boundaries:

| Limit | Value |
|-------|-------|
| Max fields per filter set | 30 |
| Max conditions per field | 10 |
| Max string value length | 1000 |
| Max array items (in/notIn) | 100 |
| Max field key length | 256 |

Metadata keys support arbitrary dot-notation nesting with sane limits:

- Prefix must be `metadata.`
- Max metadata path length (excluding `metadata.`): 200 chars
- Max metadata depth: 12 segments
- Max segment length: 64 chars
- Segment chars: `[a-zA-Z0-9_-]`

Examples:

- ✅ `metadata.env`
- ✅ `metadata.runtime.env.name`
- ❌ `metadata.runtime..name` (empty segment)
- ❌ `metadata.runtime.service/name` (invalid char `/`)

## ClickHouse SQL Builder

`packages/platform/db-clickhouse/src/filter-builder.ts`

### ChFieldRegistry

Each entity declares a registry that maps logical field names to ClickHouse column details:

```typescript
interface ChFieldMapping {
  readonly column: string        // SQL column/alias
  readonly chType: string        // CH param type ("String", "UInt64", etc.)
  readonly isArray?: boolean     // in/notIn use hasAny() instead of IN
  readonly mapValue?: (v) => v   // value transform (e.g. status string -> int)
}

type ChFieldRegistry = Readonly<Record<string, ChFieldMapping>>
```

### buildClickHouseWhere()

```typescript
function buildClickHouseWhere(
  filters: FilterSet,
  registry: ChFieldRegistry,
): { clauses: string[]; params: Record<string, unknown> }
```

Translates a `FilterSet` into parameterized SQL clauses. Behavior:

- Unknown fields silently skipped (safe for forward-compatibility)
- `metadata.*` fields handled via dot-notation: `metadata.env` -> `metadata[{key:String}]` SQL expression
- Array fields use `hasAny(column, {param:Array(Type)})` for set membership
- `contains`/`notContains` auto-wrap values with `%` for ILIKE
- `mapValue` applied before parameter binding
- Param names are sequential: `f_0`, `f_1`, `f_2`, ...
- Nested metadata supports all operators, including `in`/`notIn`

**Security**: all runtime values are parameterized with ClickHouse bindings (`{name:Type}` + `query_params`). `column` and `chType` are static registry metadata defined in code (not user input).

## Trace Field Registry

`packages/platform/db-clickhouse/src/registries/trace-fields.ts`

| Field | CH Column | Type | Notes |
|-------|-----------|------|-------|
| status | overall_status | UInt8 | mapValue: "error"->2, "ok"->1, "unset"->0 |
| name | root_span_name | String | |
| sessionId | session_id | String | |
| userId | user_id | String | |
| tags | tags | String[] | isArray |
| models | models | String[] | isArray |
| providers | providers | String[] | isArray |
| serviceNames | service_names | String[] | isArray |
| cost | cost_total_microcents | UInt64 | |
| duration | duration_ns | Int64 | |
| spanCount | span_count | UInt64 | |
| errorCount | error_count | UInt64 | |
| tokensInput | tokens_input | UInt64 | |
| tokensOutput | tokens_output | UInt64 | |
| startTime | start_time | DateTime64 | |

Plus any `metadata.*` key (dynamic, no registry entry needed).

## URL Serialization

The entire `FilterSet` is serialized as a single JSON-encoded URL search param:

```
?filters={"status":[{"op":"in","value":["error"]}]}
```

Helper functions in the route file parse/serialize this:

```typescript
function parseFilters(raw?: string): FilterSet    // JSON.parse + Zod validation, fallback {}
function serializeFilters(filters: FilterSet): string | undefined  // JSON.stringify, undefined if empty
```

## Data Flow

```
UI sidebar -> FilterSet object -> JSON URL param -> server function (Zod validated)
  -> repository port (FilterSet) -> buildClickHouseWhere(filters, TRACE_FIELD_REGISTRY)
  -> parameterized SQL clauses -> ClickHouse query
```

The repository decides WHERE vs HAVING placement. For traces, filter clauses are applied in HAVING (post-GROUP BY).

## Tests

- `packages/domain/shared/src/filter.test.ts` — Zod schema validation (operators, size limits, metadata keys)
- `packages/platform/db-clickhouse/src/filter-builder.test.ts` — SQL builder (all operators, array fields, metadata, mapValue, unknown fields, multiple conditions)

## Adding a New Entity

To add filtering for a new entity (e.g. spans, datasets):

1. Create a `ChFieldRegistry` in `packages/platform/db-clickhouse/src/registries/<entity>-fields.ts`
2. Call `buildClickHouseWhere(filters, YOUR_REGISTRY)` in the entity's repository
3. Accept `FilterSet` in the entity's repository port and server functions
4. Reuse `filterSetSchema` for validation at the API boundary

No changes needed to the core types or SQL builder.

## Future Work

- **OR logic**: Current design is AND-only. Supporting OR would require a nested structure (e.g. `{ or: [FilterSet, FilterSet] }`). Not needed yet.
- **Saved views**: `FilterSet` can be persisted to a Postgres column as JSONB. Add a saved_views table with `filters: FilterSet` and a name/label.
- **Public API filtering**: Expose `FilterSet` in REST/GraphQL API request bodies for trace listing endpoints.
- **Operator validation per field**: Add a domain-level `FieldRegistry` that declares allowed operators per field, so the UI can show only valid operators. Currently not enforced — the SQL builder accepts any operator for any field.
- **Postgres adapter**: Build a `buildPostgresWhere()` function following the same `FieldRegistry` pattern for entities stored in Postgres.
- **Date presets as filters**: The time filter dropdown currently manages its own state outside `FilterSet` for the preset labels. Could be unified.
