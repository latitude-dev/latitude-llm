# RFC: Filters

**Status:** Draft
**Authors:** Andrés, César
**Date:** 2026-03-04

## 1. Context and Motivation

Filters are a shared primitive across multiple platform entities — datasets, annotation queues, and the traces UI all own and store filters. However, a filter always queries the same target: the spans table in ClickHouse. The filter abstraction is reused across entities, but the data it filters is always spans.

This RFC defines the filter grammar, attribute type system, storage model, and the shared package that owns this logic.

## 2. Filter Model

A filter is a set of predicates evaluated against span attributes. Multiple predicates combine with AND semantics by default.

### 2.1 Predicate Structure

Each predicate has three parts:

| Field | Type | Description |
|---|---|---|
| `attribute` | `AttributeKey` | The span field to filter on (e.g., `duration`, `provider`, `tags`) |
| `operator` | `Operator` | The comparison operator |
| `value` | `FilterValue` | A static value or another attribute key |

**Static value example:** `duration > 500`
**Attribute-to-attribute example:** `model != responseModel` (comparing two span fields at query time)

### 2.2 Attribute Types

Each attribute has a declared type. The type determines which operators are valid for that attribute. Types map directly to ClickHouse column types so that the query builder can generate correct SQL without runtime type coercion.

| Type | ClickHouse equivalent | Valid operators |
|---|---|---|
| `string` | `String`, `LowCardinality(String)` | `=`, `!=`, `contains`, `notContains`, `startsWith`, `endsWith`, `matchesRegex`, `notMatchesRegex`, `in`, `notIn`, `isEmpty`, `isNotEmpty` |
| `number` | `Int8/16/32/64`, `UInt8/16/32/64`, `Float32/64`, `Decimal` | `=`, `!=`, `>`, `<`, `>=`, `<=`, `between`, `in`, `notIn` |
| `boolean` | `Bool` (`UInt8` alias) | `=`, `!=` |
| `date` | `Date`, `Date32` | `=`, `!=`, `>`, `<`, `>=`, `<=`, `between` |
| `datetime` | `DateTime`, `DateTime64` | `=`, `!=`, `>`, `<`, `>=`, `<=`, `between` |
| `enum` | `Enum8`, `Enum16`, `LowCardinality(String)` | `=`, `!=`, `in`, `notIn` |
| `string[]` | `Array(String)` | `contains`, `notContains`, `containsAny`, `containsAll`, `isEmpty`, `isNotEmpty` |
| `number[]` | `Array(Int64)`, `Array(Float64)` | `contains`, `notContains`, `containsAny`, `containsAll`, `isEmpty`, `isNotEmpty` |
| `map` | `Map(String, String)` | `hasKey`, `hasValue` |
| `nullable<T>` | `Nullable(T)` | All operators valid for `T`, plus `isNull`, `isNotNull` |

**Notes:**
- `matchesRegex` translates to ClickHouse's `match(col, pattern)` function, which uses RE2 syntax (no lookaheads, no backreferences). In URLs, regex values are wrapped in `/…/` (e.g. `query=content:/[a-z]+/`).
- `between` translates to `col >= low AND col <= high` and applies to `number`, `date`, and `datetime` types.
- `in` / `notIn` accept an array of static values and apply to scalar types (`string`, `number`, `enum`).
- For array-typed attributes: `contains` / `notContains` check for a single value (`has`); `containsAny` checks if the array contains at least one of the given values (`hasAny`); `containsAll` checks if the array contains all of the given values (`hasAll`).
- Time range filtering (`start_time`) is not expressed as a predicate — it is a first-class field handled separately. See section 3.

The canonical attribute list is defined in `packages/domain/filters` and is the source of truth for both the UI and the ClickHouse query builder. It will be finalized once the span schema is stable.

### 2.3 Filter Grammar (JSON)

A filter is represented as an array of predicate objects:

```json
[
  { "attribute": "tags", "operator": "containsAny", "value": ["production", "staging"] },
  { "attribute": "model", "operator": "!=", "value": { "attribute": "responseModel" } }
]
```

## 3. Storage Model

Filters use two tables: `filters` is a parent container row that owns the filter identity and enforces tenancy; `filter_predicates` holds one row per predicate, FK'd to the parent.

```
latitude.filters
├── id              (cuid, PK)
├── organization_id (text, for RLS)
├── time_range      (varchar, nullable — relative preset: "1h" | "6h" | "12h" | "24h" | "7d" | "14d" | "30d" | "90d" | "6mo" | "1y")
├── from_ts         (timestamptz, nullable — absolute range start, UTC)
├── to_ts           (timestamptz, nullable — absolute range end, UTC)
├── created_at      (timestamptz)
└── updated_at      (timestamptz)

latitude.filter_predicates
├── id              (cuid, PK)
├── filter_id       (FK → filters.id, ON DELETE CASCADE)
├── organization_id (text, for RLS)
├── position        (integer — ordering of predicates within the filter)
├── attribute       (varchar — attribute key)
├── operator        (varchar — operator name)
├── value           (jsonb — static value or attribute reference object)
├── created_at      (timestamptz)
└── updated_at      (timestamptz)
```

Entities that own a filter (e.g. `datasets`) hold a non-nullable `filter_id` FK → `filters.id`. An empty filter (zero predicates, no time range) means "no filter applied" — the `filters` row is created eagerly alongside the owning entity in the same transaction. There is no null state.

**Time range rules:**
- `time_range` and `from_ts`/`to_ts` are mutually exclusive. Set one or the other, never both.
- `time_range` is a relative preset resolved to absolute UTC timestamps at query execution time.
- `from_ts`/`to_ts` are absolute UTC timestamps — used when the user picked a custom date range.
- All three nullable means no time constraint (return all spans regardless of time).

A filter defines *which* records match. Concerns like `limit`, `order_by`, and `order_direction` are query-time parameters supplied by the caller, not stored state.

### Write Flow

The UI manages predicates as local state. On apply, the full predicate array is sent and the server replaces atomically:

1. `DELETE FROM filter_predicates WHERE filter_id = ?`
2. `INSERT INTO filter_predicates (...)` for each predicate
3. All in a single transaction

No predicate IDs are needed on the client. No diff logic is needed on the server.

## 4. Implementation

All filter logic is centralized in a new domain package: `packages/domain/filters`.

### 4.1 Package Responsibilities

- **Schema definitions:** Zod schemas for the filter grammar, attribute keys, operators, and value types.
- **Validation:** Parse and validate filter JSON from any source (API body, URL query string, DB row).
- **URL serialization:** `filterToSearchParams` and `searchParamsToFilter` — used in `apps/web` with TanStack typed routes and in `apps/api` for query string parsing.
- **DB serialization:** `rowsToFilter` and `filterToRows` — map between DB rows and the domain `Filter` type.

ClickHouse translation is **not** a responsibility of this package. The spans domain receives a `Filter` and is responsible for translating it into ClickHouse SQL, since it owns the span schema and knows which columns map to which attributes.

### 4.2 URL Serialization Format

All predicates are expressed in a single `query` parameter, space-separated:

```
?query=<expression> <expression> ...
```

Spaces between predicates are percent-encoded as `%20` on the wire. `URLSearchParams` handles encoding and decoding transparently — code always works with the decoded form:

```
# decoded (readable)
?query=environment:production temperature:>0.5

# on the wire
?query=environment%3Aproduction%20temperature%3A%3E0.5
```

`&` is not used between predicates — it separates distinct URL parameters. Using `&query=` a second time would create a second parameter, not a second predicate. All predicates belong to the single `query` value.

Values are documented in their decoded form throughout this RFC.

**Grammar:**

| Syntax | Operator |
|---|---|
| `attr:value` | `=` (default) |
| `-attr:value` | `!=` |
| `attr:>value` | `>` |
| `attr:<value` | `<` |
| `attr:>=value` | `>=` |
| `attr:<=value` | `<=` |
| `attr:(A OR B)` | `in` / `containsAny` |
| `-attr:(A OR B)` | `notIn` / `notContains` |
| `attr:[A TO B]` | `between` |
| `attr:value*` | `startsWith` |
| `attr:*value` | `endsWith` |
| `attr:*value*` | `contains` |
| `attr:/pattern/` | `matchesRegex` |
| `attr:*` | `isNotEmpty` |
| `attr:""` | `isEmpty` |

**Operator parsing rules:**
- `>=` and `<=` are matched greedily before `>` and `<`.
- `(A OR B)` and `[A TO B]` are distinguished by their opening bracket; `OR` and `TO` keywords are case-insensitive.
- Negation (`-attr:...`) inverts the operator to its natural pair: `=` → `!=`, `in` → `notIn`, `containsAny` → `notContains`.
- `attr:""` and `attr:*` translate to `empty(attr)` and `notEmpty(attr)` respectively. This correctly handles `LowCardinality(String)` columns that use `''` as the null sentinel — never `= ''` or `!= ''`.

**Special value prefixes:**

| Prefix | Meaning |
|---|---|
| `$` | Attribute reference — e.g. `model:!=$responseModel` |

**Time range parameters** (separate from `query=` predicates):

Time range is always expressed as dedicated URL parameters, never as `query=` predicates. All timestamps are UTC milliseconds (Unix epoch ms).

| Parameter | Meaning |
|---|---|
| `from_ts=<ms>` | Absolute range start — produced by the date picker |
| `to_ts=<ms>` | Absolute range end — produced by the date picker |
| `time_range=<preset>` | Relative preset — e.g. `7d`, `30d`. Mutually exclusive with `from_ts`/`to_ts` |

The date picker always materializes to `from_ts`/`to_ts` when the user picks a custom range. `time_range=` is written when the user selects a relative preset (last 7 days, last 30 days, etc.).

**Full example:**

```
?query=tags:(production OR staging) -model:$responseModel&time_range=30d
```

**Escaping:**

The following characters have special meaning in the expression grammar and must be escaped with `\` when they appear literally in a value:

```
: ( ) [ ] * ? " \
```

Examples:

| Raw value | Escaped expression |
|---|---|
| `https://example.com` | `url:https\://example.com` |
| `order (pending)` | `status:order\ \(pending\)` |
| `v1.*` | `version:v1\.*` |

In practice the UI always generates expressions programmatically, so escaping is handled transparently. Manual escaping is only relevant when constructing `query=` params by hand (e.g. API calls, CLI scripts).

Alternatively, wrap the entire value in double quotes to avoid escaping individual characters — any value inside `"..."` is treated as a literal string:

```
url:"https://example.com"
status:"order (pending)"
```

Double quotes themselves inside a quoted value are escaped with `\"`:

```
message:"he said \"hello\""
```

### 4.3 Filter UI Rendering

Active predicates are rendered as **chips** — compact, read-only tag-like elements displayed in a row above the results table. Each chip shows the attribute name, operator, and value(s) in a human-readable form (e.g. `provider = openai`, `tags: production`). Chips have an × to remove the predicate and are clickable to open an inline edit popover.

There is no freeform text omnibar. The UI is entirely structured: users pick an attribute from a dropdown, choose an operator from the valid set for that attribute, and enter a value in the appropriate input control (text field, multiselect, date picker, etc.). This avoids the need for a text parser and keeps the UI discoverable.

On the client, a filter is a plain array of `Predicate` objects. The active chips reflect this array directly. Adding a predicate opens the add-filter panel; removing a chip splices from the array. The array is serialized to the URL when the user applies the filter.

```typescript
// Serialize to URL when the user applies the filter
navigate({ search: filterToSearchParams(predicates) })
```

### 4.4 Serialization Contracts

Apps pass the raw query string in and receive a validated `Predicate[]` out — no encoding knowledge required at the app layer.

```typescript
// URL round-trip
function searchParamsToFilter(rawQuery: string): Predicate[]  // parses + validates, throws on invalid input
function filterToSearchParams(predicates: Predicate[]): string // produces the compact query string

// DB round-trip (used when reading/writing filter rows)
function rowsToFilter(rows: FilterPredicateRow[]): Predicate[]
function filterToRows(predicates: Predicate[], filterId: string): FilterPredicateRow[]
```

**Hono usage:**
```typescript
const predicates = searchParamsToFilter(new URL(c.req.url).search)
```

**TanStack usage:**
```typescript
// configure once at the router level
const router = createRouter({
  parseSearch: (search) => ({ filters: searchParamsToFilter(search) }),
  stringifySearch: ({ filters }) => filterToSearchParams(filters),
})
```

### 4.5 Filter State and UI (`apps/web`)

Filter state and filter UI are separate concerns. The store is the source of truth; UI components are dumb readers and writers; URL sync is a side effect of the store.

#### Filter store

A Zustand store holds the complete filter state — predicates and time range together:

```typescript
// apps/web/src/stores/filter-store.ts
type FilterState = {
  predicates: Predicate[]
  timeRange: TimeRange  // { preset: TimeRangePreset } | { fromTs: number; toTs: number } | null
  setPredicates: (predicates: Predicate[]) => void
  setTimeRange: (timeRange: TimeRange | null) => void
  addPredicate: (predicate: Predicate) => void
  removePredicate: (index: number) => void
  reset: () => void
}

export const createFilterStore = (initial?: { predicates?: Predicate[]; timeRange?: TimeRange }) =>
  create<FilterState>((set) => ({
    predicates: initial?.predicates ?? [],
    timeRange: initial?.timeRange ?? null,
    setPredicates: (predicates) => set({ predicates }),
    setTimeRange: (timeRange) => set({ timeRange }),
    addPredicate: (predicate) => set((s) => ({ predicates: [...s.predicates, predicate] })),
    removePredicate: (index) => set((s) => ({ predicates: s.predicates.filter((_, i) => i !== index) })),
    reset: () => set({ predicates: initial?.predicates ?? [], timeRange: initial?.timeRange ?? null }),
  }))
```

`FilterStoreProvider` creates the store and provides it via context. It takes optional initial state — used when loading stored predicates from a dynamic dataset or annotation queue:

```typescript
<FilterStoreProvider initialPredicates={dataset?.filterPredicates} initialTimeRange={dataset?.timeRange}>
  <FilterSidebar />
  <FilterChips />
  <SpanTable />
  <SaveFilterButton />
</FilterStoreProvider>
```

#### URL sync

URL sync is a single subscriber mounted at the provider level. It runs whenever predicates or time range change and calls `navigate` — no component needs to know about it:

```typescript
// inside FilterStoreProvider
const { predicates, timeRange } = useFilterStore()

useEffect(() => {
  navigate({
    search: (prev) => ({
      ...prev,
      ...filterToSearchParams({ predicates, timeRange }),
    }),
  })
}, [predicates, timeRange])
```

On mount, the store is initialized from the URL (for ephemeral traces page) or from the passed initial state (for stored filters). These are mutually exclusive — pages either own a stored filter or read from the URL, not both.

#### Attribute facets sidebar

The sidebar renders one stacked panel per `facet: true` attribute. Each panel shows the attribute name and a checkbox list of its top N values with occurrence counts. Checking a value calls `addPredicate`; unchecking calls `removePredicate` — both write directly to the store.

Which attributes appear is declared in the `ATTRIBUTES` registry:
- `facet: true` — include in sidebar
- `searchable: true` — add a typeahead search box in the panel (for high-cardinality attributes like `tags`)

**Low-cardinality attributes** (`provider`, `model`, `operation`) use `searchable: false`. Their facet values are not loaded globally — they are the distinct values present in the **current query results**. The facet query runs the same WHERE clause as the main span query, grouped by the attribute:

```sql
SELECT attr_value, count() AS count
FROM spans
WHERE <current predicates + time range>
GROUP BY attr_value
ORDER BY count DESC
```

This means facet values and counts always reflect what is visible in the table. Checking a checkbox narrows the results; unchecking restores them.

**High-cardinality attributes** (`tags`) use `searchable: true`. Distinct values from results could be in the thousands, so the panel shows the top 20 most frequent tags globally (not scoped to the current query) and offers a typeahead search for the rest. This is a deliberate trade-off: scoping tag facets to the current query would be too expensive for unbounded arrays.

**TanStack DB collection** — one collection covers all attributes:

```typescript
// apps/web/src/db/collections.ts
export const attributeFacetsCollection = createCollection<{
  id: string        // `${attribute}::${value}`
  attribute: string
  value: string
  count: number
}>({ id: "attributeFacets" })
```

**Server functions** — two variants, one per facet mode:

```typescript
// apps/web/src/server/spans/get-attribute-facet-values.ts

// Low-cardinality: one batched request for all static facet attributes.
// Runs the current WHERE clause once in ClickHouse and returns a GROUP BY
// per attribute — one round-trip regardless of how many facet attributes exist.
export const getFacetValuesForQuery = createServerFn()
  .validator(z.object({
    attributes: z.array(attributeKeySchema),
    predicates: predicatesSchema,
    timeRange: timeRangeSchema.nullable(),
  }))
  .handler(async ({ data, context }) => {
    // returns Record<AttributeKey, { value: string; count: number }[]>
    return getSpanFacetValuesUseCase({
      organizationId: context.organizationId,
      attributes: data.attributes,
      predicates: data.predicates,
      timeRange: data.timeRange,
    })
  })

// High-cardinality: global top N + optional search (not scoped to current query)
export const getGlobalAttributeFacetValues = createServerFn()
  .validator(z.object({
    attribute: attributeKeySchema,
    search: z.string().optional(),
  }))
  .handler(async ({ data, context }) => {
    return getSpanGlobalFacetValuesUseCase({
      organizationId: context.organizationId,
      attribute: data.attribute,
      search: data.search,
      limit: 20,
    })
  })
```

**`useAttributeFacets` hook** — drives both facet modes from the store:

```typescript
// apps/web/src/components/filter-sidebar/use-attribute-facets.ts
function useAttributeFacets() {
  const db = useTanStackDB()
  const { predicates, timeRange } = useFilterStore()

  const staticFacets = Object.entries(ATTRIBUTES)
    .filter(([, def]) => def.facet && !def.searchable)
    .map(([key]) => key as AttributeKey)

  const searchableFacets = Object.entries(ATTRIBUTES)
    .filter(([, def]) => def.facet && def.searchable)
    .map(([key]) => key as AttributeKey)

  // Low-cardinality: one batched request whenever the current query changes
  useEffect(() => {
    getFacetValuesForQuery({ attributes: staticFacets, predicates, timeRange }).then((resultsByAttribute) => {
      Object.entries(resultsByAttribute).forEach(([attribute, values]) => {
        db.attributeFacetsCollection.setMany(values, { where: { attribute } })
      })
    })
  }, [predicates, timeRange])

  // High-cardinality: load top 20 globally on mount only
  useEffect(() => {
    searchableFacets.forEach((attribute) => {
      getGlobalAttributeFacetValues({ attribute }).then((results) => {
        db.attributeFacetsCollection.upsertMany(results)
      })
    })
  }, [])

  function search(attribute: AttributeKey, query: string) {
    getGlobalAttributeFacetValues({ attribute, search: query }).then((results) => {
      db.attributeFacetsCollection.setMany(results, { where: { attribute } })
    })
  }

  function valuesFor(attribute: AttributeKey) {
    return db.attributeFacetsCollection.filter((item) => item.attribute === attribute)
  }

  return { valuesFor, search }
}
```

Selected values are always pinned at the top of a searchable facet list; search results fill the rest. Clearing the search restores the global top 20.

#### Saving filters

"Save Search" and "Save as Dataset" are plain buttons anywhere in the tree that read the current store state and call a server function. They are not coupled to any filter UI component:

```typescript
function SaveSearchButton() {
  const { predicates, timeRange } = useFilterStore()

  return (
    <Button onClick={() => saveSearchServerFn({ predicates, timeRange })}>
      Save search
    </Button>
  )
}
```

For a dynamic dataset page, saving replaces the stored filter predicates and time range via a dedicated server action — the store state is the input, nothing more.

### 4.6 Rendering Constants

The filters package exports all constants needed to render a filter form. These are pure data — no React or UI dependencies — so they live in the domain package and can be consumed by both `apps/web` and any future SDK.

**Operators:**

```typescript
export const OPERATORS = {
  EQ:              "=",
  NEQ:             "!=",
  GT:              ">",
  LT:              "<",
  GTE:             ">=",
  LTE:             "<=",
  BETWEEN:         "between",
  CONTAINS:        "contains",
  NOT_CONTAINS:    "notContains",
  STARTS_WITH:     "startsWith",
  ENDS_WITH:       "endsWith",
  MATCHES_REGEX:   "matchesRegex",
  NOT_MATCHES_REGEX: "notMatchesRegex",
  IN:              "in",
  NOT_IN:          "notIn",
  CONTAINS_ANY:    "containsAny",
  CONTAINS_ALL:    "containsAll",
  HAS_KEY:         "hasKey",
  HAS_VALUE:       "hasValue",
  IS_EMPTY:        "isEmpty",
  IS_NOT_EMPTY:    "isNotEmpty",
  IS_NULL:         "isNull",
  IS_NOT_NULL:     "isNotNull",
} as const
```

**Relative date presets:**

The allowed values for `time_range` (both in the URL and in `filters.time_range` storage) are defined as a constant:

```typescript
export const TIME_RANGE_PRESETS = {
  "1h":  "Last 1 hour",
  "6h":  "Last 6 hours",
  "12h": "Last 12 hours",
  "24h": "Last 24 hours",
  "7d":  "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "6mo": "Last 6 months",
  "1y":  "Last 1 year",
} as const

export type TimeRangePreset = keyof typeof TIME_RANGE_PRESETS
```

**Attribute registry** — each attribute is defined explicitly with its type and the exact set of valid operators. Since span attributes are a known, bounded list, this is more precise than deriving operators from the type alone. The final attribute list will be completed once the span schema is stable.

```typescript
const NUMBER_OPS     = ["=", "!=", ">", "<", ">=", "<=", "between"] as const
const DATETIME_OPS   = ["=", "!=", ">", "<", ">=", "<=", "between"] as const
const STRING_OPS     = ["=", "!=", "contains", "notContains", "startsWith", "endsWith",
                        "matchesRegex", "notMatchesRegex", "in", "notIn",
                        "isEmpty", "isNotEmpty"] as const
const STRING_ARR_OPS = ["contains", "notContains", "containsAny", "containsAll",
                        "anyStartsWith", "anyEndsWith", "anyMatchesRegex",
                        "isEmpty", "isNotEmpty"] as const
const ID_OPS         = ["=", "!=", "in", "notIn"] as const

export const ATTRIBUTES = {
  // Known attributes
  // `defaultOperator` drives the colon-notation shorthand (section 4.2)
  // `facet` controls sidebar visibility; `searchable` adds typeahead to the facet panel
  session_id:   { type: "string",   operators: ID_OPS,         defaultOperator: "=",           facet: false                    },
  trace_id:     { type: "string",   operators: ID_OPS,         defaultOperator: "=",           facet: false                    },
  project_id:   { type: "string",   operators: ID_OPS,         defaultOperator: "=",           facet: false                    },
  api_key_slug: { type: "string",   operators: STRING_OPS,     defaultOperator: "=",           facet: true,  searchable: false },
  tags:         { type: "string[]", operators: STRING_ARR_OPS, defaultOperator: "containsAny", facet: true,  searchable: true  },
  // ... remaining attributes added once span schema is finalized
} as const satisfies Record<string, AttributeDefinition>

export type AttributeDefinition = {
  type: AttributeType
  operators: readonly Operator[]
  defaultOperator: Operator
  facet: boolean
  searchable?: boolean  // only relevant when facet: true
}
```

How each operator renders its value input is a `SpanFilterForm` concern in `apps/web`, not defined here.

### 4.7 Package Location

```
packages/domain/filters/
├── src/
│   ├── entities/
│   │   ├── predicate.ts      # Predicate, AttributeKey, Operator, FilterValue types + Zod schema
│   │   ├── time-range.ts     # TIME_RANGE_PRESETS constant + TimeRangePreset type
│   │   └── attributes.ts     # ATTRIBUTES registry + AttributeDefinition type
│   ├── serialization.ts      # URL ↔ predicates and DB row ↔ predicates converters
│   └── index.ts              # public exports
├── package.json
└── tsconfig.json
```

**`index.ts` exports:**

```typescript
// Types
export type { Predicate, AttributeKey, Operator, FilterValue } from "./entities/predicate.ts"
export type { AttributeDefinition } from "./entities/attributes.ts"

// Constants
export { TIME_RANGE_PRESETS } from "./entities/time-range.ts"
export type { TimeRangePreset } from "./entities/time-range.ts"
export { ATTRIBUTES } from "./entities/attributes.ts"

// Serialization
export { searchParamsToFilter, filterToSearchParams, rowsToFilter, filterToRows } from "./serialization.ts"
```

`searchParamsToFilter` validates its output internally — it parses the raw query string and guarantees the result is a valid `Predicate[]`, throwing a typed error if any predicate is malformed. The Zod schema that powers this validation lives in `entities/predicate.ts` alongside the TypeScript types. Apps receive either valid predicates or a clear error; they never handle raw unvalidated filter data.

### 4.8 Dynamic Span Attributes

The span table stores user-defined attributes in typed map columns: `attr_string`, `attr_int`, `attr_float`, `attr_bool`, and `resource_string`. These are populated at ingest time and are unbounded — any key may appear.

Dynamic attributes are exposed in the same flat namespace as schema attributes — no prefix is needed. The resolution rule is:

1. If the attribute key is found in the `ATTRIBUTES` registry → treat it as a schema column lookup.
2. Otherwise → treat it as a dynamic map lookup and infer the ClickHouse map column from the predicate value and operator.

The omnibar and filter form show schema attributes and dynamic attributes in one flat list. Users type `temperature`, `environment`, `url`, etc. directly.

**URL examples:**

```
?query=environment:production
?query=temperature:>0.5
?query=environment:production temperature:>0.5
```

**Type inference rules:**

The spans domain infers which map column to query from the parsed value:

| Value / operator | Resolved column | Example |
|---|---|---|
| String value, equality/string ops | `attr_string` | `environment:production` |
| Integer literal | `attr_int` | `retries:>3` |
| Float literal (contains `.`) | `attr_float` | `temperature:>0.5` |
| `true` or `false` literal | `attr_bool` | `enabled:true` |
| Comparison operator (`>`, `<`, `>=`, `<=`) + integer | `attr_int` | `count:>=10` |
| Comparison operator + float | `attr_float` | `score:>=0.9` |

No cross-column OR needed. The value literal is unambiguous: `3` is an integer, `3.0` is a float, `true`/`false` is boolean, anything else is a string.

```typescript
// spans domain (ClickHouse translation)
if (attribute in ATTRIBUTES) {
  // schema column — handled by the static attribute path
} else {
  // dynamic map lookup — infer column from value/operator
  const col = inferAttrColumn(value, operator)  // "attr_string" | "attr_int" | "attr_float" | "attr_bool"
  return `${col}[${quoteString(attribute)}]`
}
```

> **Note:** To avoid collision with schema column names, prefer OTel-namespaced keys for custom attributes at ingest time (e.g. `gen_ai.temperature`, `http.url`). The filter system accepts any key, but unnamespaced keys that clash with schema attribute names will always resolve to the schema column rather than the dynamic map.

Dynamic attributes are **not** present in the `ATTRIBUTES` registry — they are an open namespace. The `SpanFilterForm` exposes an "attribute" input that accepts both known attribute keys (from `ATTRIBUTES`) and free-text dynamic keys.

## 5. Open Questions

1. **Attribute list finalization.** The canonical list of filterable span attributes is not yet fixed. The attribute registry in `attributes.ts` is the single place to add new filterable fields once the span schema stabilizes.
2. **OR semantics.** For v1, all predicates combine with AND. OR support can be added later by wrapping predicates in a `{ or: [...] }` group envelope without breaking the existing grammar.
3. **Typed dynamic attributes (v2).** Full resolution of dynamic keys to the correct typed map column (`attr_string`, `attr_int`, etc.) requires a key-type registry built at ingest time. In v1, all dynamic keys resolve to `attr_string`.
