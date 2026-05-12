# Migrate Issue Search From Weaviate To Postgres pgvector

> **Documentation**: `dev-docs/issues.md`, `dev-docs/reliability.md`

## Spec Contract

This spec defines the project plan for moving issue clustering/search storage from Weaviate to Postgres + pgvector. The previous ClickHouse issue-projection plan is intentionally abandoned. ClickHouse remains the home for telemetry analytics and trace search only.

While this migration is under construction, overlap with future-state docs is acceptable. Once the migration is complete, durable details should be promoted into the linked `dev-docs/*` files and stale Weaviate references should be removed.

## Goals

- Store issue centroid search vectors inline on the canonical Postgres `latitude.issues` table.
- Use pgvector for exact project-scoped cosine search over issue centroids.
- Use Postgres full-text search for the lexical component of existing hybrid ranking.
- Remove Weaviate from issue search/projection runtime paths.
- Remove the unshipped ClickHouse `issue_projections` work from this PR.
- Preserve business behavior as much as possible: thresholds, hybrid scoring intent, rerank gate, lifecycle inclusion, and two-stage duplicate-create locking.

## Non-goals

- Do not move issue search to ClickHouse.
- Do not keep a separate issue projection table in Postgres.
- Do not add ANN indexes (`hnsw` / `ivfflat`) initially.
- Do not redesign issue discovery business behavior.
- Do not migrate or repair seed/demo data specifically.
- Do not replace Redis issue-discovery locks with Postgres locks in this PR.
- Do not remove the `issues.uuid` column in this PR, even though search should stop depending on it.

## Current State

- Weaviate is actively used in production for issue projection storage and hybrid search.
- Postgres already owns canonical issue lifecycle and centroid state in `latitude.issues.centroid` JSONB.
- `IssueProjectionRepository` is the current domain port used for issue projection writes and hybrid search.
- ClickHouse work on this branch added an unshipped `issue_projections` design; that work should be removed rather than merged.
- Issue discovery uses:
  - embedded/normalized feedback,
  - hybrid search,
  - reranking,
  - two-stage Redis locking to avoid duplicate fuzzy issue creation under bursty conditions.

## Target State

- `latitude.issues` stores the derived normalized centroid vector in a nullable pgvector column.
- `IssueRepository.save` maintains the derived vector whenever canonical issue state is saved.
- `IssueRepository.hybridSearch` searches canonical Postgres issue rows directly.
- `IssueProjectionRepository`, projection sync use-cases, Weaviate projection repositories, and ClickHouse issue projection code are removed.
- Search/rerank plumbing uses canonical issue ids, not Weaviate object UUIDs.
- `issues.uuid` remains for now and can be removed in a later cleanup PR.
- Weaviate package/infra/env/scripts are removed if no remaining non-issue consumers exist.

## Rollout Strategy

This branch has not shipped, so there is no ClickHouse dual-write state to preserve. Production currently uses Weaviate, but Postgres already contains the canonical centroid state needed to backfill pgvector.

Deploy as a direct cutover:

1. Postgres migration enables pgvector, adds issue search columns/indexes, and backfills `centroid_embedding` from `issues.centroid`.
2. Application code deploys using Postgres-only issue search and `IssueRepository.save` vector maintenance.
3. Weaviate issue projection runtime wiring is removed.

There is no temporary dual-write period. The migration must make existing searchable issue data available in Postgres before the new application code serves traffic.

## Postgres Schema Design

Update `latitude.issues` with:

```txt
centroid_embedding vector(2048) NULL
search_document     tsvector GENERATED ALWAYS AS (...) STORED
```

`centroid_embedding` is nullable now. Empty/no-evidence centroids store `NULL`, not a zero vector. A future PR may revisit nullability, but this migration should keep it nullable.

`search_document` should be a generated weighted document based on canonical issue text:

```sql
setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
setweight(to_tsvector('simple', coalesce(description, '')), 'B')
```

Use the `simple` text search configuration. Issue text often contains product names, model names, error codes, and technical terms where English stemming/stopword behavior is undesirable.

Add a GIN index on `search_document`.

Do not add an ANN vector index initially. Exact scans are acceptable because issue search is project-scoped and expected to operate over low-thousands of issues per project at most.

Add a lightweight consistency CHECK constraint for non-null vectors:

```sql
CHECK (
  CASE
    WHEN centroid_embedding IS NULL THEN true
    ELSE centroid->>'model' = 'voyage-4-large'
      AND (centroid->>'mass')::double precision > 0
  END
)
```

The `vector(2048)` type enforces vector dimensionality. Do not add expensive CHECK constraints that recompute JSONB centroid normalization.

## pgvector Extension And Local/Test Infrastructure

pgvector is now a required Postgres extension.

Migration:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Local Docker should use a pgvector-enabled Postgres 16 image, for example a pinned `pgvector/pgvector:pg16` image, rather than plain `postgres:16`.

PGlite supports pgvector in this repo through `@electric-sql/pglite/vector`. The shared PGlite test helper should load it for all tests because migrations will require the extension:

```ts
import { vector } from "@electric-sql/pglite/vector"

const client = new PGlite({
  extensions: { vector },
})
```

## Migration Backfill

Backfill from canonical Postgres state only. Do not read from Weaviate.

The migration should:

1. Enable `vector` extension.
2. Add `centroid_embedding` and `search_document`.
3. Create the GIN index and CHECK constraint.
4. Backfill `centroid_embedding` from `issues.centroid`.

Backfill rules:

- If `(centroid->>'mass')::double precision <= 0`, set `centroid_embedding = NULL`.
- Otherwise normalize `centroid->'base'` and cast to `vector(2048)`.
- Preserve array order when reading JSONB base values.
- Assume existing data is correct; no elaborate data validation is required.
- Let natural casts/type constraints fail if data is malformed.
- Use a migration-local helper function if it makes SQL simpler, and drop it before the migration ends.

No separate operator backfill script is needed.

## Runtime Vector Maintenance

`centroid_embedding` is derived persistence state and should not be part of the domain `Issue` entity.

`IssueRepository.save` should compute and write `centroid_embedding` from the canonical `issue.centroid`:

- If `issue.centroid.mass <= 0`, write `NULL`.
- If centroid is non-empty, require `issue.centroid.model === CENTROID_EMBEDDING_MODEL`.
- Use existing `normalizeIssueCentroid` for normalization math.
- Validate the resulting vector has `CENTROID_EMBEDDING_DIMENSIONS` entries.
- Validate all values are finite.
- Trust `normalizeIssueCentroid`; no explicit unit-norm tolerance check is required.
- If centroid mass is positive but normalization returns an empty vector, fail the save with `RepositoryError`.

This replaces projection sync. Delete `syncIssueProjectionsUseCase` and remove its call sites.

`refreshIssueDetailsUseCase` needs no explicit search sync after changing name/description because `search_document` is generated from canonical columns.

## Search Port And Domain Shape

Delete `IssueProjectionRepository` and move search to `IssueRepository`.

Add a lightweight search candidate type using canonical issue ids and canonical field names:

```ts
export interface IssueSearchCandidate {
  readonly issueId: IssueId
  readonly name: string
  readonly description: string
  readonly score: number
}
```

Add to `IssueRepositoryShape`:

```ts
hybridSearch(input: {
  readonly projectId: ProjectId
  readonly query: string
  readonly normalizedEmbedding: readonly number[]
}): Effect.Effect<readonly IssueSearchCandidate[], RepositoryError, SqlClient>
```

Repository methods should rely on `SqlClient` organization context/RLS, not accept `organizationId` as input.

Remove `findByUuid` from `IssueRepository`. Keep the `issues.uuid` column and domain field for now; dropping it is a later cleanup.

Remove `resolveMatchedIssueUseCase`. Search results are now canonical Postgres issue ids scoped by project/org, not eventually consistent Weaviate object UUIDs.

Remove `hybridSearchIssuesUseCase`; it is only a thin wrapper and should not survive the port move.

Keep `rerankIssueCandidatesUseCase`; it contains real business logic and should be updated from UUID terminology to issue-id terminology:

```ts
export interface RetrievalResult {
  readonly matchedIssueId: IssueId | null
  readonly similarityScore: number
}
```

## Postgres Hybrid Search

Preserve existing business behavior and ranking intent:

- 75% vector relevance.
- 25% lexical relevance.
- `ISSUE_DISCOVERY_MIN_SIMILARITY = 0.8` applies to final hybrid score.
- `ISSUE_DISCOVERY_SEARCH_CANDIDATES = 1000` candidate limit applies.
- Include resolved and ignored issues; callers retain existing lifecycle filtering/assignment behavior.
- Lexical score is a boost, not a hard filter.
- One shared hybrid search method serves discovery and issue list/export search, matching current architecture.

Query vector contract:

- Input is already normalized; keep current behavior.
- Repository validates length and finite numbers.
- Repository does not normalize query embeddings.

Scoring shape:

```txt
vector_score = 1 - cosine_distance(issue.centroid_embedding, query_embedding)
lexical_score = least(1, greatest(0, ts_rank_cd(search_document, websearch_to_tsquery('simple', query))))
hybrid_score =
  ISSUE_DISCOVERY_SEARCH_RATIO * vector_score
  + (1 - ISSUE_DISCOVERY_SEARCH_RATIO) * lexical_score
```

Search filters:

```sql
organization_id = current organization context
project_id = input.projectId
centroid_embedding IS NOT NULL
```

Do not add repeated JSONB model/mass checks to the search query; consistency is enforced on write/backfill.

Ordering:

```sql
ORDER BY hybrid_score DESC, vector_score DESC, updated_at DESC, id ASC
```

Use `id` as the final stable tiebreaker, not `uuid`.

Implementation should use raw SQL inside `SqlClient.query` for clarity, while still parameterizing user input and vectors. Do not interpolate user-supplied values.

## Issue Discovery Flow

Preserve business behavior. Do not redesign discovery beyond removing obsolete projection/Weaviate layers.

Keep:

- initial eligibility check in the Temporal workflow,
- feedback embedding/normalization,
- two-stage locking in `serializeIssueDiscoveryUseCase`,
- hybrid search before rerank,
- rerank threshold gate,
- assign existing issue vs create new issue behavior,
- analytics sync after workflow success.

Simplify workflow activities:

- Remove the pre-lock fast path that does hybrid search, rerank, resolve-by-UUID, then direct assignment before serialization.
- Always call `serializeIssueDiscovery` after embedding.
- `serializeIssueDiscoveryUseCase` performs search/rerank under the existing feedback/project Redis locks.

Keep Redis locks for this PR. The duplicate-create race still exists with Postgres-only fuzzy search because concurrent workers can both observe no sufficiently similar issue before either creates one. A row lock cannot lock a fuzzy issue that does not exist. Postgres advisory locks may be considered later, but are not part of this migration.

Do not run AI rerank or issue detail generation inside long Postgres transactions. Keep long external retrieval/rerank/generation outside DB transactions as today.

## Code Areas To Update

Expected changes:

- `specs/migrate-issue-search-to-pgvector.md` (this spec)
- `packages/platform/db-postgres/src/schema/issues.ts`
- `packages/platform/db-postgres/drizzle/...` migration generated via Drizzle tooling/custom migration tooling
- `packages/platform/db-postgres/src/repositories/issue-repository.ts`
- `packages/platform/db-postgres/src/test/in-memory-postgres.ts`
- `docker-compose.yml` Postgres image
- `packages/domain/issues/src/ports/issue-repository.ts`
- `packages/domain/issues/src/use-cases/serialize-issue-discovery.ts`
- `packages/domain/issues/src/use-cases/rerank-issue-candidates.ts`
- `packages/domain/issues/src/use-cases/list-issues.ts`
- `packages/domain/issues/src/use-cases/build-issues-export.ts` if search candidate shape changes affect it
- `apps/workflows/src/workflows/issue-discovery-workflow.ts`
- `apps/workflows/src/activities/issue-discovery-activities.ts`
- app/web/worker workflow wiring currently providing Weaviate issue projection repositories
- tests affected by repository/search/rerank shape changes
- `dev-docs/issues.md` and related durable docs after implementation

Remove obsolete areas:

- `IssueProjectionRepository` port and fake/testing helpers
- composite projection repository created for ClickHouse dual-write
- `syncIssueProjectionsUseCase` and tests
- `hybridSearchIssuesUseCase` and tests
- `resolveMatchedIssueUseCase` and tests
- `IssueProjectionRepositoryClickHouseLive`
- ClickHouse `issue_projections` migrations from this unshipped branch
- ClickHouse issue projection backfill script
- Weaviate issue projection repository/wiring
- Weaviate package/infra/env/scripts if no references remain

## Testing Requirements

Tests should focus on preserved behavior and new storage mechanics.

Postgres repository tests should cover:

- `IssueRepository.save` writes a non-null `centroid_embedding` for positive-mass centroids.
- `IssueRepository.save` writes `NULL` for empty centroids.
- Updating an issue from non-empty to empty clears the vector.
- Runtime save rejects non-empty incompatible centroid model/dimensions/non-finite vectors.
- `hybridSearch` validates query vector dimensions and finite values.
- `hybridSearch` scopes by organization/RLS and project.
- `hybridSearch` excludes rows with `centroid_embedding IS NULL`.
- Exact cosine vector ranking contributes to score.
- Lexical `ts_rank_cd` contributes a bounded boost but is not a hard filter.
- Final threshold uses `ISSUE_DISCOVERY_MIN_SIMILARITY`.
- Candidate limit uses `ISSUE_DISCOVERY_SEARCH_CANDIDATES`.
- Ordering is deterministic: hybrid score, vector score, updated time, id.

Domain tests should cover:

- `rerankIssueCandidatesUseCase` uses issue ids and canonical `name`/`description`.
- `serializeIssueDiscoveryUseCase` calls `IssueRepository.hybridSearch` directly and preserves two-stage lock behavior.
- Projection sync and UUID resolution tests are removed/replaced.
- List/export search maps scores by issue id, not uuid.

Workflow tests should cover:

- Issue discovery workflow no longer calls pre-lock hybrid search/rerank/resolve activities.
- Workflow embeds feedback, calls `serializeIssueDiscovery`, then syncs analytics.
- Lock retry behavior around serialization is preserved.

PGlite tests should load `@electric-sql/pglite/vector`; do not require a separate real-Postgres-only test path solely for pgvector.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Spec and removal of rejected ClickHouse path

- [x] Rename the spec to `specs/migrate-issue-search-to-pgvector.md`.
- [x] Replace the ClickHouse plan with the Postgres/pgvector plan.
- [x] Remove unshipped ClickHouse issue projection migrations, repository, exports, tests, and backfill script.

### Phase 2 - Postgres schema and migration

- [x] Add pgvector support to local Docker Postgres.
- [x] Update PGlite test helper to load `@electric-sql/pglite/vector`.
- [x] Add Drizzle schema awareness for `centroid_embedding` and generated `search_document`.
- [x] Generate/create the Postgres migration using repo-approved Drizzle commands.
- [x] Implement migration backfill from `issues.centroid` to `centroid_embedding`.
- [x] Add GIN index and lightweight CHECK constraint.

### Phase 3 - Domain port cleanup

- [x] Add `IssueSearchCandidate` and `IssueRepository.hybridSearch`.
- [x] Remove `IssueProjectionRepository` and related fake/composite helpers.
- [x] Remove `syncIssueProjectionsUseCase` and all call sites.
- [x] Remove `hybridSearchIssuesUseCase`.
- [x] Remove `resolveMatchedIssueUseCase` and `IssueRepository.findByUuid`.
- [x] Update rerank use-case from UUID to issue-id terminology.
- [x] Update list/export/search consumers to map by issue id.

### Phase 4 - Postgres repository implementation

- [x] Make `IssueRepository.save` maintain `centroid_embedding`.
- [x] Implement `IssueRepository.hybridSearch` with pgvector + full-text hybrid scoring.
- [ ] Add repository tests for save/search behavior.

### Phase 5 - Workflow/app wiring

- [x] Simplify issue discovery workflow to remove pre-lock search/rerank/resolve/direct-assign fast path.
- [x] Wire issue search to Postgres repository only.
- [x] Remove Weaviate providers from issue discovery/list/export paths.
- [ ] Remove Weaviate package/infra/env/scripts if no references remain.

### Phase 6 - Documentation cleanup

- [ ] Update `dev-docs/issues.md` after implementation to describe Postgres pgvector issue search.
- [ ] Update reliability docs to remove Weaviate issue-search references.
- [ ] Remove stale comments that say issue search/projections live in Weaviate.
