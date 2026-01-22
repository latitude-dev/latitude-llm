# ClickHouse Architecture Analysis for LLM Observability Platforms

This document analyzes a production-grade ClickHouse schema designed for LLM observability, tracing, and evaluation systems. The architecture demonstrates mature patterns for handling high-volume telemetry data with strong consistency requirements.

## Table of Contents

- [Core Data Model](#core-data-model)
- [Engine Selection](#engine-selection)
- [Indexing Strategy](#indexing-strategy)
- [Materialized Views & Aggregations](#materialized-views--aggregations)
- [Schema Evolution Patterns](#schema-evolution-patterns)
- [Strengths](#strengths)
- [Weaknesses & Trade-offs](#weaknesses--trade-offs)
- [Lessons Learned](#lessons-learned)

---

## Core Data Model

The schema consists of three primary tables forming a hierarchical relationship:

```
traces (parent)
  └── observations (children - spans, generations, events)
  └── scores (evaluation results)
```

### Traces Table

```sql
CREATE TABLE traces (
    `id` String,
    `timestamp` DateTime64(3),
    `name` String,
    `user_id` Nullable(String),
    `metadata` Map(LowCardinality(String), String),
    `release` Nullable(String),
    `version` Nullable(String),
    `project_id` String,
    `public` Bool,
    `bookmarked` Bool,
    `tags` Array(String),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output` Nullable(String) CODEC(ZSTD(3)),
    `session_id` Nullable(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (project_id, toDate(timestamp))
ORDER BY (project_id, toDate(timestamp), id);
```

**Key Design Choices:**

| Feature | Choice | Rationale |
|---------|--------|-----------|
| Primary Key | `(project_id, toDate(timestamp))` | Multi-tenant queries always filter by project + time range |
| Partition | `toYYYYMM(timestamp)` | Monthly partitions balance query performance with partition management |
| Engine | `ReplacingMergeTree(event_ts, is_deleted)` | Supports updates/deletes via event sourcing pattern |
| Compression | `ZSTD(3)` on input/output | LLM payloads are large text; ZSTD provides excellent compression |
| Metadata | `Map(LowCardinality(String), String)` | Flexible key-value storage with dictionary encoding for keys |

### Observations Table

```sql
CREATE TABLE observations (
    `id` String,
    `trace_id` String,
    `project_id` String,
    `type` LowCardinality(String),
    `parent_observation_id` Nullable(String),
    `start_time` DateTime64(3),
    `end_time` Nullable(DateTime64(3)),
    `name` String,
    `metadata` Map(LowCardinality(String), String),
    `level` LowCardinality(String),
    `status_message` Nullable(String),
    `version` Nullable(String),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output` Nullable(String) CODEC(ZSTD(3)),
    `provided_model_name` Nullable(String),
    `internal_model_id` Nullable(String),
    `model_parameters` Nullable(String),
    `provided_usage_details` Map(LowCardinality(String), UInt64),
    `usage_details` Map(LowCardinality(String), UInt64),
    `provided_cost_details` Map(LowCardinality(String), Decimal64(12)),
    `cost_details` Map(LowCardinality(String), Decimal64(12)),
    `total_cost` Nullable(Decimal64(12)),
    `completion_start_time` Nullable(DateTime64(3)),
    `prompt_id` Nullable(String),
    `prompt_name` Nullable(String),
    `prompt_version` Nullable(UInt16),
    `tool_definitions` Map(String, String),
    `tool_calls` Array(String),
    `tool_call_names` Array(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    INDEX idx_id id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_project_id project_id TYPE bloom_filter() GRANULARITY 1
) ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, type, toDate(start_time))
ORDER BY (project_id, type, toDate(start_time), id);
```

**Key Design Choices:**

| Feature | Choice | Rationale |
|---------|--------|-----------|
| Primary Key | `(project_id, type, toDate(start_time))` | Type filtering (SPAN vs GENERATION) is extremely common |
| `LowCardinality` | On `type`, `level` | Enum-like fields with few distinct values benefit from dictionary encoding |
| Cost tracking | Dual `provided_*` and computed fields | Separates user-provided from system-calculated values |
| Tool support | `Map` for definitions, `Array` for calls | Flexible storage for function calling patterns |

### Scores Table

```sql
CREATE TABLE scores (
    `id` String,
    `timestamp` DateTime64(3),
    `project_id` String,
    `trace_id` String,
    `observation_id` Nullable(String),
    `name` String,
    `value` Float64,
    `source` String,
    `comment` Nullable(String) CODEC(ZSTD(1)),
    `author_user_id` Nullable(String),
    `config_id` Nullable(String),
    `data_type` String,
    `string_value` Nullable(String),
    `queue_id` Nullable(String),
    `session_id` Nullable(String),
    `dataset_run_id` Nullable(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_trace_observation (project_id, trace_id, observation_id) TYPE bloom_filter(0.001) GRANULARITY 1
) ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (project_id, toDate(timestamp), name)
ORDER BY (project_id, toDate(timestamp), name, id);
```

**Key Design Choices:**

| Feature | Choice | Rationale |
|---------|--------|-----------|
| Primary Key | Includes `name` | Score queries often aggregate by score name (e.g., "accuracy", "latency") |
| Composite Index | `(project_id, trace_id, observation_id)` | Enables efficient lookups for "all scores for this trace" |
| Flexible values | `Float64` + `string_value` + `data_type` | Supports numeric, boolean, and categorical scores |

---

## Engine Selection

### ReplacingMergeTree Pattern

All three core tables use `ReplacingMergeTree(event_ts, is_deleted)`:

```sql
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
```

**Why ReplacingMergeTree?**

1. **Event Sourcing**: LLM observability data arrives asynchronously and may need updates
2. **Soft Deletes**: `is_deleted` flag enables GDPR-compliant deletion without immediate physical removal
3. **Eventual Consistency**: ClickHouse merges duplicates in background; queries use `FINAL` or filter on `is_deleted = 0`

**Trade-off**: Queries must account for duplicates:
```sql
-- Option 1: Use FINAL (slower but correct)
SELECT * FROM traces FINAL WHERE project_id = 'xxx'

-- Option 2: Use subquery with argMax (faster for complex queries)
SELECT argMax(name, event_ts) as name, ...
FROM traces
WHERE is_deleted = 0
GROUP BY project_id, id
```

### Supporting Tables

| Table | Engine | Purpose |
|-------|--------|---------|
| `event_log` | `MergeTree()` | Append-only audit log for S3 event references |
| `blob_storage_file_log` | `ReplacingMergeTree` | Tracks blob storage files with soft delete support |
| `dataset_run_items_rmt` | `ReplacingMergeTree` | Experiment/dataset run tracking |

---

## Indexing Strategy

### Bloom Filter Indexes

The schema makes extensive use of bloom filters for skip indexes:

```sql
INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1
INDEX idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
INDEX idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
```

**Key Insights:**

| Index | FPR | Rationale |
|-------|-----|-----------|
| `idx_id` | 0.001 (0.1%) | Point lookups by ID are critical; low FPR acceptable |
| `idx_metadata_*` | 0.01 (1%) | Metadata searches are exploratory; higher FPR saves space |
| Composite indexes | 0.001 | Multi-column filters need precision |

**GRANULARITY 1**: Every granule (8192 rows by default) gets its own bloom filter. This is aggressive but appropriate for high-cardinality fields like IDs.

### Map Indexing

The metadata Map columns have separate indexes for keys and values:

```sql
INDEX idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
INDEX idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
```

This enables queries like:
```sql
-- Find traces with specific metadata key
WHERE metadata['environment'] IS NOT NULL

-- Find traces with specific metadata value
WHERE has(mapValues(metadata), 'production')
```

---

## Materialized Views & Aggregations

### Analytics Views (Simple Views)

Simple views provide real-time analytics aggregations:

```sql
CREATE VIEW analytics_traces AS
SELECT
    project_id,
    toStartOfHour(timestamp) AS hour,
    uniq(id) AS countTraces,
    max(user_id IS NOT NULL) AS hasUsers,
    max(session_id IS NOT NULL) AS hasSessions,
    max(if(environment != 'default', 1, 0)) AS hasEnvironments,
    max(length(tags) > 0) AS hasTags
FROM traces
WHERE toStartOfHour(timestamp) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY project_id, hour;
```

**Purpose**: Feature usage analytics without pre-materialization overhead.

### AggregatingMergeTree Pattern (Attempted & Reverted)

The schema shows an interesting evolution. Migration 0023 introduced a sophisticated pattern:

```sql
-- Null engine table as event trigger (no storage)
CREATE TABLE traces_null (...) Engine = Null();

-- Aggregating table for pre-computed rollups
CREATE TABLE traces_all_amt (
    `project_id` String,
    `id` String,
    `timestamp` SimpleAggregateFunction(min, DateTime64(3)),
    `name` SimpleAggregateFunction(anyLast, Nullable(String)),
    `metadata` SimpleAggregateFunction(maxMap, Map(String, String)),
    `tags` SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `cost_details` SimpleAggregateFunction(sumMap, Map(String, Decimal(38, 12))),
    `input` AggregateFunction(argMax, String, DateTime64(3)) CODEC(ZSTD(3)),
    ...
) Engine = AggregatingMergeTree() ORDER BY (project_id, id);

-- Materialized view feeding the aggregating table
CREATE MATERIALIZED VIEW traces_all_amt_mv TO traces_all_amt AS
SELECT
    project_id,
    id,
    min(start_time) as timestamp,
    anyLast(name) as name,
    maxMap(metadata) as metadata,
    groupUniqArrayArray(tags) as tags,
    sumMap(cost_details) as cost_details,
    argMaxState(input, if(input <> '', event_ts, toDateTime64(0, 3))) as input,
    ...
FROM traces_null
GROUP BY project_id, id;
```

**TTL Variants**:
```sql
-- 7-day retention for hot queries
CREATE TABLE traces_7d_amt (...) TTL toDate(start_time) + INTERVAL 7 DAY;

-- 30-day retention for recent queries
CREATE TABLE traces_30d_amt (...) TTL toDate(start_time) + INTERVAL 30 DAY;
```

**Why This Pattern?**
1. **Null Engine**: Receives inserts but stores nothing; triggers MVs
2. **AggregatingMergeTree**: Pre-computes aggregations at insert time
3. **TTL Tables**: Automatic data lifecycle management

**Why It Was Reverted (Migrations 0028-0029)?**

The AMT tables were dropped, suggesting:
- Maintenance complexity outweighed benefits
- Query patterns didn't require pre-aggregation
- Storage costs for multiple TTL variants
- Synchronization challenges between raw and aggregated data

---

## Schema Evolution Patterns

### Column Additions

```sql
-- Synchronous ALTER for critical columns
ALTER TABLE observations ADD COLUMN tool_calls Array(String) DEFAULT [] 
    SETTINGS alter_sync = 2;

-- Asynchronous ALTER for less critical columns
ALTER TABLE observations ADD COLUMN usage_pricing_tier_id Nullable(String);
```

**`alter_sync = 2`**: Waits for all replicas to apply the change. Critical for columns that will be immediately written.

### Index Materialization

```sql
ALTER TABLE observations ADD INDEX IF NOT EXISTS idx_res_metadata_key 
    mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE observations MATERIALIZE INDEX IF EXISTS idx_res_metadata_key;
```

**Two-step process**: Add index definition, then materialize for existing data.

---

## Strengths

### 1. Multi-Tenant Design
- `project_id` is first in every PRIMARY KEY
- All queries naturally filter by tenant
- Efficient data isolation without table-per-tenant overhead

### 2. Time-Series Optimization
- Monthly partitioning aligns with retention policies
- `toDate(timestamp)` in ORDER BY enables efficient range scans
- Partition pruning for time-bounded queries

### 3. Flexible Schema
- `Map` types for metadata enable schema-less attributes
- `Array` types for tags and tool calls
- Nullable fields where appropriate

### 4. Compression Strategy
- ZSTD(3) for large text fields (input/output)
- ZSTD(1) for smaller text (comments)
- LowCardinality for enum-like strings

### 5. Event Sourcing Support
- `event_ts` enables conflict resolution
- `is_deleted` supports soft deletes
- ReplacingMergeTree handles duplicates

---

## Weaknesses & Trade-offs

### 1. Query Complexity with ReplacingMergeTree
- Every query must handle potential duplicates
- `FINAL` keyword adds overhead
- `argMax` patterns increase query complexity

### 2. No Foreign Key Enforcement
- Referential integrity is application-level responsibility
- Orphaned observations/scores possible if trace deleted incorrectly

### 3. Denormalization Overhead
- `dataset_run_items_rmt` denormalizes run metadata
- Updates require rewriting entire rows
- Storage amplification for frequently-updated metadata

### 4. Limited Join Performance
- ClickHouse joins are expensive
- Schema assumes application-level joins or denormalization
- Trace → Observations lookups require careful query design

### 5. Bloom Filter Maintenance
- Indexes consume memory
- False positive rate tuning requires monitoring
- GRANULARITY 1 is aggressive for large tables

---

## Lessons Learned

### What Works Well

1. **ReplacingMergeTree for mutable data**: Event sourcing pattern handles the inherent mutability of observability data
2. **Composite PRIMARY KEYs**: Multi-tenant + time-based access patterns are well-optimized
3. **Map types for metadata**: Flexible without schema changes
4. **ZSTD compression**: Excellent for LLM text payloads

### What to Avoid

1. **Over-engineering aggregations**: The AMT pattern was removed; start simple
2. **Too many TTL variants**: Increases complexity without proportional benefit
3. **Null engine triggers**: Added complexity for marginal gains

### Recommendations for New Implementations

1. **Start with ReplacingMergeTree** for any data that might need updates
2. **Use simple VIEWs** before materialized views; add pre-aggregation only when needed
3. **Monitor bloom filter effectiveness** before adding more indexes
4. **Design for `project_id` first** in all access patterns
5. **Use `LowCardinality`** liberally for string columns with < 10,000 distinct values
6. **Partition by month** unless you have specific reasons for different granularity
7. **Compress large text** with ZSTD; the CPU cost is worth the I/O savings
