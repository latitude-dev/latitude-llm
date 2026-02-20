# Latitude Telemetry Platform - Refactor Plan

## Executive Summary

This document outlines a plan to rebuild the Latitude platform from scratch, pivoting from a prompt management system with telemetry to a **telemetry-first platform** focused on:

1. **Span ingestion and storage** (ClickHouse as primary)
2. **Annotation queue** for human review
3. **Issue discovery** from annotations
4. **Automatic evaluation generation** and optimization

**Estimated Timeline: 17-24 weeks (4-6 months)** with a team of 2-3 engineers.

---

## Current Architecture Overview

### What Exists Today

The current platform is a sophisticated LLM observability system with:

- **Dual-storage**: PostgreSQL (primary) + ClickHouse (analytics)
- **Git-like version control**: Commits and document versions for prompt management
- **OpenTelemetry-based tracing**: Multi-standard span ingestion
- **Multi-type evaluations**: Rule-based, LLM-as-judge, human, composite
- **Issue discovery**: AI-powered with vector similarity search
- **Auto evaluation generation**: From documents and issues with MCC validation

### Key Files to Understand

```
packages/core/src/schema/models/spans.ts                    # PostgreSQL spans schema
packages/core/src/schema/models/evaluationResultsV2.ts      # PostgreSQL eval results
packages/core/clickhouse/migrations/                        # ClickHouse schema
packages/core/src/services/tracing/spans/                   # Span ingestion
packages/core/src/services/evaluationsV2/                   # Evaluation system
packages/core/src/services/issues/                          # Issue discovery
packages/core/src/services/commits/                         # Git-like version control
packages/core/src/services/documents/                       # Prompt management
```

---

## Architectural Changes

### 1. Storage: PostgreSQL → ClickHouse

**Current State:**

- Dual-write to PostgreSQL (source of truth) and ClickHouse (analytics)
- PostgreSQL handles relationships via foreign keys
- ClickHouse optimized for aggregations

**Target State:**

- ClickHouse as primary storage for spans and evaluation results
- PostgreSQL only for workspace/user management and configuration
- Remove document/commit foreign key dependencies

**Schema Changes Needed:**

```sql
-- Enhanced spans table (already exists, needs modifications)
CREATE TABLE spans (
  workspace_id UInt64,
  trace_id FixedString(32),
  span_id FixedString(16),
  parent_id Nullable(FixedString(16)),

  -- Remove: document_uuid, commit_uuid, experiment_uuid, project_id
  -- These tie spans to the prompt management system

  -- Keep: Core telemetry data
  api_key_id UInt64,
  name String,
  kind LowCardinality(String),
  type LowCardinality(String),
  status LowCardinality(String),
  message Nullable(String),
  duration_ms UInt64,
  started_at DateTime64(6, 'UTC'),
  ended_at DateTime64(6, 'UTC'),

  -- Model info
  provider LowCardinality(String),
  model Nullable(String),
  cost Nullable(Int64),
  tokens_prompt Nullable(UInt32),
  tokens_completion Nullable(UInt32),

  -- Add: Annotation metadata
  annotation_status LowCardinality(Nullable(String)), -- 'pending', 'annotated', 'skipped'
  annotated_at Nullable(DateTime64(6, 'UTC')),
  annotated_by Nullable(UInt64),

  -- Add: Issue references (denormalized)
  issue_uuids Array(UUID), -- Array of issue UUIDs this span is associated with

  ingested_at DateTime64(6, 'UTC'),
  retention_expires_at DateTime64(6, 'UTC')
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(started_at)
ORDER BY (workspace_id, started_at, trace_id, span_id);

-- Enhanced evaluation results
CREATE TABLE evaluation_results (
  id UInt64,
  uuid UUID,
  workspace_id UInt64,

  -- Remove: project_id, commit_id, commit_uuid, document_uuid
  -- Remove: evaluation_uuid (will use evaluation_id from PostgreSQL)

  evaluation_id UInt64, -- Reference to PostgreSQL config
  type LowCardinality(Nullable(String)),
  metric LowCardinality(Nullable(String)),

  evaluated_span_id Nullable(String),
  evaluated_trace_id Nullable(String),

  score Nullable(Int64),
  normalized_score Nullable(Int64),
  has_passed Nullable(UInt8),

  metadata Nullable(String) CODEC(ZSTD(3)),
  error Nullable(String) CODEC(ZSTD(3)),

  created_at DateTime64(3, 'UTC'),
  updated_at DateTime64(3, 'UTC'),

  -- Add: Generation metadata
  generated_from_issue_uuid Nullable(UUID),
  generation_version UInt32 DEFAULT 1
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (workspace_id, evaluation_id, created_at, id);

-- New: Issues table in ClickHouse
CREATE TABLE issues (
  uuid UUID,
  workspace_id UInt64,

  title String,
  description Nullable(String),

  -- Vector embedding for similarity search (if using ClickHouse vector search)
  -- OR store in separate vector DB like Weaviate
  centroid_embedding Nullable(String) CODEC(ZSTD(3)),

  status LowCardinality(String), -- 'open', 'resolved', 'ignored'
  severity LowCardinality(String), -- 'low', 'medium', 'high', 'critical'

  created_at DateTime64(6, 'UTC'),
  updated_at DateTime64(6, 'UTC'),
  resolved_at Nullable(DateTime64(6, 'UTC')),

  -- Metrics
  occurrence_count UInt64 DEFAULT 0,
  last_occurred_at Nullable(DateTime64(6, 'UTC'))
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (workspace_id, status, created_at, uuid);

-- New: Annotation queue
CREATE TABLE annotation_queue (
  id UInt64,
  workspace_id UInt64,

  span_id String,
  trace_id String,

  priority UInt8 DEFAULT 5, -- 1-10, lower is higher priority
  status LowCardinality(String), -- 'pending', 'in_progress', 'completed', 'skipped'

  assigned_to Nullable(UInt64),

  -- Sampling strategy that created this entry
  sampling_strategy LowCardinality(String), -- 'random', 'error_based', 'issue_based'

  created_at DateTime64(6, 'UTC'),
  updated_at DateTime64(6, 'UTC'),
  completed_at Nullable(DateTime64(6, 'UTC'))
)
ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (workspace_id, status, priority, created_at);
```

---

## Phase-by-Phase Implementation

### Phase 1: Foundation & Data Layer (Weeks 1-4)

**Goals:**

- Set up ClickHouse as primary storage
- Remove PostgreSQL dependencies for spans/evals
- Update ingestion pipeline
- Data migration tooling

**Tasks:**

#### Week 1: Schema & Migrations

- [ ] Create new ClickHouse migrations for enhanced schema
- [ ] Remove document/commit dependencies from spans table
- [ ] Add annotation and issue fields
- [ ] Create issues and annotation_queue tables
- [ ] Update both clustered and unclustered migrations

**Files to modify:**

```
packages/core/clickhouse/migrations/unclustered/0009_telemetry_first_schema.up.sql
packages/core/clickhouse/migrations/clustered/0009_telemetry_first_schema.up.sql
```

#### Week 2: Ingestion Pipeline

- [ ] Update span ingestion to write only to ClickHouse
- [ ] Remove PostgreSQL span writes from `processSpansBulk.ts`
- [ ] Update span specifications to remove document/commit dependencies
- [ ] Ensure idempotent writes with deduplication

**Reusable code:**

```typescript
// Keep: packages/core/src/services/tracing/spans/ingestion/process.ts
// Keep: packages/core/src/services/tracing/spans/specifications/*.ts
// Modify: packages/core/src/services/tracing/spans/ingestion/processBulk.ts
```

#### Week 3: Query Layer

- [ ] Create ClickHouse query utilities for spans
- [ ] Replace PostgreSQL span queries with ClickHouse
- [ ] Implement pagination for large result sets
- [ ] Add filtering and aggregation queries

**New files:**

```
packages/core/src/services/tracing/spans/clickhouse/findByWorkspace.ts
packages/core/src/services/tracing/spans/clickhouse/findByTrace.ts
packages/core/src/services/tracing/spans/clickhouse/aggregate.ts
```

#### Week 4: Data Migration

- [ ] Build migration tool to export PostgreSQL spans to ClickHouse
- [ ] Handle backfill for historical data
- [ ] Verify data integrity
- [ ] Performance testing on large datasets

**New files:**

```
packages/core/src/scripts/migrateSpansToClickHouse.ts
packages/core/src/scripts/verifyMigration.ts
```

**Deliverables:**

- Spans stored exclusively in ClickHouse
- Ingestion pipeline updated
- Migration scripts ready
- All existing tests passing

---

### Phase 2: Core Telemetry Platform (Weeks 5-10)

**Goals:**

- Simplified span ingestion (no document/commit context)
- Trace visualization UI
- Basic annotation system
- Annotation queue

**Tasks:**

#### Week 5-6: Simplified Ingestion

- [ ] Remove document resolution from span ingestion
- [ ] Remove commit/document foreign keys
- [ ] Update gateway API to remove document context
- [ ] Simplify span attributes (remove latitude.document_uuid, etc.)

**Files to modify:**

```
packages/core/src/services/tracing/spans/specifications/prompt.ts
packages/core/src/services/tracing/spans/specifications/external.ts
apps/gateway/src/routes/api/v3/projects/versions/documents/run/*.ts
```

#### Week 7: Trace Visualization

- [ ] Build trace list view (no document filtering)
- [ ] Build trace detail view with span tree
- [ ] Add filtering by time, status, type
- [ ] Add search by trace ID

**Reusable UI components:**

```
// Keep and adapt:
apps/web/src/components/traces/
```

#### Week 8: Annotation System

- [ ] Create annotation data model in ClickHouse
- [ ] Build annotation form component
- [ ] Support multiple annotation types (issue tagging, rating, text feedback)
- [ ] Link annotations to spans

**New files:**

```
packages/core/src/services/annotations/create.ts
packages/core/src/services/annotations/update.ts
packages/core/src/services/annotations/findBySpan.ts
apps/web/src/components/annotations/AnnotationForm.tsx
```

#### Week 9-10: Annotation Queue

- [ ] Build sampling strategies (random, error-based, issue-based)
- [ ] Create queue population job
- [ ] Build queue UI with priority ordering
- [ ] Assignment system for reviewers
- [ ] Progress tracking and metrics

**New files:**

```
packages/core/src/services/annotationQueue/populate.ts
packages/core/src/services/annotationQueue/assign.ts
packages/core/src/services/annotationQueue/findPending.ts
packages/core/src/jobs/job-definitions/annotationQueue/populateQueueJob.ts
apps/web/src/app/(private)/annotation-queue/page.tsx
```

**Deliverables:**

- Clean span ingestion without document dependencies
- Working trace visualization
- Annotation system functional
- Annotation queue with sampling

---

### Phase 3: Issue Discovery (Weeks 11-14)

**Goals:**

- Issue detection from annotations
- Issue lifecycle management
- Basic analytics on issues
- Vector similarity search for issue clustering

**Tasks:**

#### Week 11: Issue Data Model

- [ ] Create issue table in ClickHouse
- [ ] Build issue CRUD services
- [ ] Issue status workflow (open → resolved/ignored)
- [ ] Severity levels

**Reusable code:**

```typescript
// Adapt from:
packages / core / src / services / issues / create.ts
packages / core / src / services / issues / resolve.ts
packages / core / src / services / issues / ignore.ts
```

#### Week 12: Issue Discovery from Annotations

- [ ] Analyze annotations to detect patterns
- [ ] Auto-create issues from repeated annotations
- [ ] Issue generation service
- [ ] Link spans to issues

**New files:**

```
packages/core/src/services/issues/discoverFromAnnotations.ts
packages/core/src/services/issues/generateFromPattern.ts
packages/core/src/jobs/job-definitions/issues/discoverIssuesJob.ts
```

#### Week 13: Vector Similarity & Clustering

- [ ] Set up vector embeddings for spans (using Voyage AI or similar)
- [ ] Store embeddings in Weaviate or ClickHouse
- [ ] Implement similarity search for issue matching
- [ ] Auto-assign spans to existing issues

**Reusable code:**

```typescript
// Adapt from:
packages / core / src / services / issues / discover.ts
packages / core / src / lib / WeaviateClient / index.ts
```

#### Week 14: Issue Analytics

- [ ] Issue occurrence tracking over time
- [ ] Issue severity trends
- [ ] Resolution time metrics
- [ ] Issue distribution by type/category

**New files:**

```
packages/core/src/services/issues/analytics/occurrenceTrends.ts
packages/core/src/services/issues/analytics/resolutionMetrics.ts
apps/web/src/app/(private)/issues/analytics/page.tsx
```

**Deliverables:**

- Issue system fully functional
- Automatic issue discovery from annotations
- Vector similarity matching
- Issue analytics dashboard

---

### Phase 4: Auto Evaluation Generation (Weeks 15-20)

**Goals:**

- Generate evaluations from issues
- Evaluation optimization loop
- Validation system
- A/B testing for evaluation versions

**Tasks:**

#### Week 15-16: Evaluation Generation from Issues

- [ ] Build prompt for generating evaluations from issue descriptions
- [ ] Create evaluation configuration from issue patterns
- [ ] Support rule-based and LLM-as-judge evaluations
- [ ] Store evaluation configs in PostgreSQL

**Reusable code:**

```typescript
// Adapt from:
packages/core/src/services/evaluationsV2/generateFromIssue/*.ts
packages/core/src/services/evaluationsV2/create.ts
```

#### Week 17: Evaluation Optimization

- [ ] Track evaluation performance metrics
- [ ] Identify false positives/negatives
- [ ] Iterative improvement loop
- [ ] Feedback mechanism for evaluation quality

**New files:**

```
packages/core/src/services/evaluationsV2/optimization/analyzePerformance.ts
packages/core/src/services/evaluationsV2/optimization/improvePrompt.ts
packages/core/src/jobs/job-definitions/evaluations/optimizeEvaluationJob.ts
```

#### Week 18: Validation System

- [ ] Ground truth dataset creation from annotations
- [ ] Evaluation accuracy metrics (precision, recall, F1)
- [ ] MCC (Matthews Correlation Coefficient) calculation
- [ ] Threshold optimization

**Reusable code:**

```typescript
// Adapt from:
packages /
  core /
  src /
  services /
  evaluationsV2 /
  generateFromIssue /
  evaluateConfiguration.ts
packages /
  core /
  src /
  services /
  evaluationsV2 /
  generateFromIssue /
  calculateMCC.ts
```

#### Week 19-20: Evaluation Runner

- [ ] Background job to run evaluations on new spans
- [ ] Batch evaluation for historical data
- [ ] Real-time evaluation on span ingestion
- [ ] Evaluation result storage in ClickHouse

**New files:**

```
packages/core/src/services/evaluationsV2/runOnSpan.ts
packages/core/src/jobs/job-definitions/evaluations/runEvaluationJob.ts
```

**Deliverables:**

- Automatic evaluation generation from issues
- Optimization loop functional
- Validation metrics tracking
- Evaluation runner processing spans

---

### Phase 5: Testing, Polish & Migration (Weeks 21-24)

**Goals:**

- Comprehensive testing
- Performance optimization
- Documentation
- Migration tooling for existing users

**Tasks:**

#### Week 21-22: Testing

- [ ] Unit tests for all new services
- [ ] Integration tests for ingestion pipeline
- [ ] End-to-end tests for annotation flow
- [ ] Load testing for ClickHouse queries
- [ ] Migration testing

**Files:**

```
packages/core/src/services/tracing/spans/**/*.test.ts
packages/core/src/services/annotations/**/*.test.ts
packages/core/src/services/issues/**/*.test.ts
packages/core/src/services/evaluationsV2/**/*.test.ts
```

#### Week 23: Performance & Polish

- [ ] Optimize ClickHouse queries
- [ ] Add caching for frequently accessed data
- [ ] UI performance improvements
- [ ] Error handling and edge cases
- [ ] Monitoring and alerting

#### Week 24: Documentation & Migration

- [ ] API documentation
- [ ] Migration guide for existing users
- [ ] Deployment guide
- [ ] Runbook for operations

**Deliverables:**

- Test coverage >80%
- Performance benchmarks met
- Documentation complete
- Migration path defined

---

## Reusable Code Inventory

### High Reusability (Minimal Changes)

| Component                 | Location                                                        | Notes                        |
| ------------------------- | --------------------------------------------------------------- | ---------------------------- |
| Span ingestion core       | `packages/core/src/services/tracing/spans/ingestion/process.ts` | Remove document dependencies |
| Span specifications       | `packages/core/src/services/tracing/spans/specifications/*.ts`  | Keep type detection logic    |
| ClickHouse client         | `packages/core/src/lib/ClickHouseClient/`                       | Fully reusable               |
| Weaviate client           | `packages/core/src/lib/WeaviateClient/`                         | For vector search            |
| Evaluation specifications | `packages/core/src/services/evaluationsV2/specifications.ts`    | Keep type definitions        |
| Rule evaluation           | `packages/core/src/services/evaluationsV2/rule/`                | Fully reusable               |
| LLM evaluation            | `packages/core/src/services/evaluationsV2/llm/`                 | Fully reusable               |
| AI provider setup         | `packages/core/src/services/ai/`                                | Fully reusable               |
| Event system              | `packages/core/src/events/`                                     | Fully reusable               |
| Job infrastructure        | `packages/core/src/jobs/`                                       | Fully reusable               |
| Authentication            | `apps/web/src/middlewares/authHandler.ts`                       | Fully reusable               |

### Medium Reusability (Moderate Changes)

| Component                  | Location                                                            | Changes Needed             |
| -------------------------- | ------------------------------------------------------------------- | -------------------------- |
| Span bulk processing       | `packages/core/src/services/tracing/spans/ingestion/processBulk.ts` | Remove PostgreSQL writes   |
| Evaluation result creation | `packages/core/src/services/evaluationsV2/results/create.ts`        | Write to ClickHouse only   |
| Issue services             | `packages/core/src/services/issues/*.ts`                            | Adapt to ClickHouse schema |
| Gateway handlers           | `apps/gateway/src/routes/api/v3/`                                   | Remove document context    |
| Trace UI components        | `apps/web/src/components/traces/`                                   | Remove document links      |

### Low Reusability (Major Changes or Removal)

| Component                | Location                                                     | Action                           |
| ------------------------ | ------------------------------------------------------------ | -------------------------------- |
| Commit/version system    | `packages/core/src/services/commits/`                        | Remove entirely                  |
| Document management      | `packages/core/src/services/documents/`                      | Remove entirely                  |
| Prompt resolution        | `packages/core/src/services/documents/getResolvedContent.ts` | Remove                           |
| Chain execution          | `packages/core/src/lib/streamManager/`                       | Remove (or keep minimal version) |
| Run document             | `packages/core/src/services/commits/runDocumentAtCommit.ts`  | Remove                           |
| Evaluation versions      | `packages/core/src/schema/models/evaluationVersions.ts`      | Simplify                         |
| Composite evaluations    | `packages/core/src/services/evaluationsV2/composite/`        | Remove                           |
| Live evaluation triggers | Event handlers                                               | Simplify                         |

---

## Technical Considerations

### ClickHouse as Primary Storage

**Advantages:**

- Excellent performance for time-series data
- Built-in compression
- Efficient aggregations
- Horizontal scaling

**Challenges:**

- No ACID transactions (use ReplacingMergeTree with versioning)
- Limited UPDATE/DELETE support
- Eventual consistency
- Need to denormalize data

**Mitigations:**

- Use `ReplacingMergeTree` with version columns for upserts
- Implement idempotent writes
- Accept eventual consistency for analytics
- Denormalize foreign key relationships

### Vector Search

**Options:**

1. **Weaviate** (current): Keep using, good integration
2. **ClickHouse vector search**: New feature, worth evaluating
3. **Pinecone/Milvus**: External service, adds complexity

**Recommendation:** Keep Weaviate for now, evaluate ClickHouse vectors later.

### Annotation Queue Sampling

**Strategies:**

1. **Random**: Simple, unbiased
2. **Error-based**: Prioritize error spans
3. **Issue-based**: Prioritize spans matching known issues
4. **Diversity**: Use embeddings to sample diverse examples

**Implementation:**

- Configurable sampling rate per workspace
- Priority scoring system
- Queue population runs as scheduled job

### Evaluation Generation

**From Issues:**

- Use issue description + examples to generate evaluation criteria
- Start with binary (pass/fail) evaluations
- Iterate based on false positive/negative rates

**Optimization Loop:**

1. Run evaluation on annotated spans
2. Compare with human annotations
3. Calculate precision/recall
4. Adjust prompt or threshold
5. Retest

---

## Team Structure & Responsibilities

### Recommended Team: 3 Engineers

**Engineer 1: Data & Infrastructure**

- ClickHouse schema design
- Ingestion pipeline
- Migration tooling
- Performance optimization

**Engineer 2: Backend Services**

- Annotation system
- Issue discovery
- Evaluation generation
- API endpoints

**Engineer 3: Frontend & Integration**

- Trace visualization
- Annotation queue UI
- Issue management UI
- Analytics dashboards

### Parallel Workstreams

**Weeks 1-4 (Phase 1):**

- All engineers on foundation

**Weeks 5-10 (Phase 2):**

- Engineer 1: Query optimization, caching
- Engineer 2: Annotation backend
- Engineer 3: Frontend implementation

**Weeks 11-14 (Phase 3):**

- Engineer 1: Vector search infrastructure
- Engineer 2: Issue discovery algorithms
- Engineer 3: Issue management UI

**Weeks 15-20 (Phase 4):**

- Engineer 1: Evaluation runner infrastructure
- Engineer 2: Auto-generation algorithms
- Engineer 3: Evaluation management UI

**Weeks 21-24 (Phase 5):**

- All engineers on testing, polish, documentation

---

## Risk Assessment

| Risk                                | Likelihood | Impact | Mitigation                                  |
| ----------------------------------- | ---------- | ------ | ------------------------------------------- |
| ClickHouse query performance issues | Medium     | High   | Early load testing, query optimization      |
| Data migration complexity           | High       | High   | Incremental migration, verification tools   |
| Feature parity gaps                 | Medium     | Medium | Clear scope definition, user feedback loops |
| Team learning curve                 | Low        | Medium | Knowledge sharing, documentation            |
| Integration issues                  | Medium     | High   | Comprehensive testing, staging environment  |

---

## Success Metrics

### Technical Metrics

- Span ingestion latency < 100ms p99
- ClickHouse query latency < 500ms for common queries
- Migration completes without data loss
- Test coverage > 80%

### Product Metrics

- Annotation queue processing time
- Issue discovery accuracy
- Evaluation generation quality (MCC > 0.7)
- User adoption of new features

---

## Next Steps

1. **Review and approve plan** - Stakeholder sign-off
2. **Set up development environment** - Feature branch or new repo
3. **Begin Phase 1** - Schema and ingestion
4. **Weekly check-ins** - Track progress and adjust
5. **User feedback loops** - Demo progress to early users

---

## Appendix: File Inventory

### Files to Keep (Reusable)

```
packages/core/src/lib/ClickHouseClient/
packages/core/src/lib/WeaviateClient/
packages/core/src/lib/Result.ts
packages/core/src/constants.ts
packages/core/src/events/
packages/core/src/jobs/
packages/core/src/services/ai/
packages/core/src/services/evaluationsV2/specifications.ts
packages/core/src/services/evaluationsV2/rule/
packages/core/src/services/evaluationsV2/llm/
packages/core/src/services/tracing/spans/ingestion/process.ts
packages/core/src/services/tracing/spans/specifications/
```

### Files to Modify

```
packages/core/clickhouse/migrations/
packages/core/src/services/tracing/spans/ingestion/processBulk.ts
packages/core/src/services/tracing/spans/clickhouse/
packages/core/src/services/evaluationsV2/results/
packages/core/src/services/issues/
apps/gateway/src/routes/api/v3/
apps/web/src/components/traces/
```

### Files to Remove

```
packages/core/src/services/commits/
packages/core/src/services/documents/
packages/core/src/services/evaluationsV2/composite/
packages/core/src/lib/streamManager/
packages/core/src/schema/models/commits.ts
packages/core/src/schema/models/documentVersions.ts
packages/core/src/schema/models/evaluationVersions.ts
```

---

_Document created: 2026-02-20_
_Version: 1.0_
