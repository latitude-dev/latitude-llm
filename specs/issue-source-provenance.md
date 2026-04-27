# Issue Source Provenance

## Problem

The deterministic sections of the system-queue flaggers (e.g. `tool-call-errors`, `output-schema-validation`, `empty-response`) can create issues directly by writing a `source="annotation"`, `sourceId="SYSTEM"` score that flows through issue discovery. There is currently no way to distinguish an issue that originated from this flagger path versus one that originated from a human annotation or a custom score.

## Goal

Add an immutable `source` field to the `Issue` entity that records the provenance of the **first score** that created the issue. This allows downstream consumers (analytics, UI badges, filtering) to detect flagger-originated issues.

## Issue Source Values

```typescript
type IssueSource = "annotation" | "custom" | "flagger";
```

- `"flagger"` — the issue was born from a deterministic system-queue flagger match. The creating score carries `source: "annotation"`, `sourceId: "SYSTEM"`. This is the only value that distinguishes the deterministic flagger path from other annotation paths.
- `"annotation"` — the issue was born from a human annotation (UI, API) or from a published system-queue draft that a human confirmed. The creating score carries `source: "annotation"` with `sourceId` equal to `"UI"`, `"API"`, or a queue CUID.
- `"custom"` — the issue was born from a custom score pushed through the API. The creating score carries `source: "custom"`.

> **Note**: `"evaluation"` is intentionally excluded. In the current system, evaluation scores are always linked to an existing issue at creation time; they never flow through `createIssueFromScoreUseCase` to spawn a brand-new issue.

## Derivation Rule

The issue source is derived from the **creating score** at the moment the issue is first persisted. It is immutable for the lifetime of the issue.

```typescript
const deriveIssueSource = (score: Score): IssueSource => {
  if (score.source === "annotation" && score.sourceId === "SYSTEM") {
    return "flagger";
  }
  if (score.source === "annotation") {
    return "annotation";
  }
  return "custom";
};
```

Note: `score.source` is a wider union than `IssueSource` (it includes `"evaluation"`), so the `else` branch must explicitly return `"custom"` rather than passing `score.source` through. Evaluation scores never reach `createIssueFromScoreUseCase` in practice, so collapsing them into `"custom"` is defensive — the only score sources that actually hit this path are `"annotation"` and `"custom"`.

This derivation is applied inside `buildNewIssueFromScore` in `create-issue-from-score.ts`, which is the single point where brand-new issues are constructed from a score. The `source` value is then stored on the `Issue` entity and persisted in Postgres.

## Why Not Store This on the Score Instead?

The score already carries `source` and `sourceId`, but those describe the score's own provenance, not the issue's. A single issue may later accumulate scores from many different sources (flagger, human annotation, custom, evaluation). The `Issue.source` field answers the specific product question "how was this issue first discovered?" without requiring a historical scan of all linked scores.

## Files to Change

### 1. Constants — `packages/domain/issues/src/constants.ts`

Add `ISSUE_SOURCES` alongside the existing `ISSUE_STATES`:

```typescript
export const ISSUE_SOURCES = ["annotation", "custom", "flagger"] as const;
```

### 2. Domain model — `packages/domain/issues/src/entities/issue.ts`

Import `ISSUE_SOURCES` from `../constants.ts` and add `issueSourceSchema` plus the `source` field to `issueSchema`:

```typescript
import { ISSUE_NAME_MAX_LENGTH, ISSUE_SOURCES, ISSUE_STATES } from "../constants.ts";

export const issueSourceSchema = z.enum(ISSUE_SOURCES);
export type IssueSource = z.infer<typeof issueSourceSchema>;

export const issueSchema = z.object({
  id: issueIdSchema,
  uuid: z.string().uuid(),
  organizationId: cuidSchema,
  projectId: cuidSchema,
  name: z.string().min(1).max(ISSUE_NAME_MAX_LENGTH),
  description: z.string().min(1),
  source: issueSourceSchema, // provenance of the first creating score
  centroid: issueCentroidSchema,
  clusteredAt: z.date(),
  escalatedAt: z.date().nullable(),
  resolvedAt: z.date().nullable(),
  ignoredAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

Export `ISSUE_SOURCES`, `issueSourceSchema`, and `IssueSource` from `packages/domain/issues/src/index.ts`. The constant lives in `constants.ts` (mirroring `ISSUE_STATES`); the schema and type live in `entities/issue.ts`.

### 3. Issue creation — `packages/domain/issues/src/use-cases/create-issue-from-score.ts`

In `buildNewIssueFromScore`, derive and set `source`. The `else` branch must explicitly map to `"custom"` because `score.source` includes `"evaluation"`, which is not a valid `IssueSource`:

```typescript
const source: IssueSource =
  score.source === "annotation" && score.sourceId === "SYSTEM"
    ? "flagger"
    : score.source === "annotation"
      ? "annotation"
      : "custom";
```

Include `source` in the returned `Issue` object.

### 4. Postgres schema — `packages/platform/db-postgres/src/schema/issues.ts`

Add the `source` column:

```typescript
source: varchar("source", { length: 32 }).$type<IssueSource>().notNull(),
```

### 5. Postgres repository — `packages/platform/db-postgres/src/repositories/issue-repository.ts`

- Update `toDomainIssue` to parse `source` from the row
- Update `toInsertRow` to include `source`
- Update the `save` upsert `set` clause to include `source`

### 6. Drizzle migration — new custom migration

Generate a custom migration following the three-step pattern used for prior additive columns (e.g. `add-slug-to-annotation-queues-with-backfill`):

1. **Add nullable**:
   ```sql
   ALTER TABLE "latitude"."issues" ADD COLUMN IF NOT EXISTS "source" varchar(32);
   ```

2. **Backfill from the earliest linked score per issue**:
   ```sql
   UPDATE "latitude"."issues" i
   SET "source" = CASE
     WHEN s.source = 'annotation' AND s.source_id = 'SYSTEM' THEN 'flagger'
     ELSE s.source
   END
   FROM (
     SELECT DISTINCT ON (issue_id) issue_id, source, source_id
     FROM "latitude"."scores"
     WHERE issue_id IS NOT NULL
     ORDER BY issue_id, created_at ASC
   ) s
   WHERE i.id = s.issue_id;
   ```

3. **Default any remaining orphaned issues** (issues with zero linked scores, which should not exist in practice but must be handled for schema safety):
   ```sql
   UPDATE "latitude"."issues"
   SET "source" = 'annotation'
   WHERE "source" IS NULL;
   ```

4. **Make non-nullable**:
   ```sql
   ALTER TABLE "latitude"."issues" ALTER COLUMN "source" SET NOT NULL;
   ```

> The migration does not need an index on `source` in the foundation phase. If filtering by `source` becomes a dominant query pattern later, add a partial or full btree index at that time.

### 7. Seed fixtures — `packages/domain/shared/src/seed-content/issues.ts`

- Add `source: IssueSource` to `SeedIssueFixture`.
- Set `source: "custom"` on `SEED_BILLING_ISSUE_ID` and `SEED_INSTALLATION_ISSUE_ID` (their occurrence scores are custom).
- Set `source: "annotation"` on every other base fixture and on every entry in `curatedExtraIssueBlueprints` and the generated extras. This is the realistic default for seed data — production issues are overwhelmingly annotation-discovered, and although base fixtures have evaluation-backed occurrences, the *first creating score* for those fixtures is treated as an annotation.

### 8. Test helpers and test files

Update every `makeIssue` / `makeIssueRow` / `issueSchema.parse` call site to include `source` (default `"annotation"` is fine for tests that don't care). The full set of files that construct `Issue` rows in tests:

Domain:
- `packages/domain/issues/src/helpers.test.ts`
- `packages/domain/issues/src/use-cases/apply-issue-lifecycle-command.test.ts`
- `packages/domain/issues/src/use-cases/assign-score-to-issue.test.ts`
- `packages/domain/issues/src/use-cases/build-issues-export.test.ts`
- `packages/domain/issues/src/use-cases/discover-issue.test.ts`
- `packages/domain/issues/src/use-cases/generate-issue-details.test.ts`
- `packages/domain/issues/src/use-cases/list-issues.test.ts`
- `packages/domain/issues/src/use-cases/refresh-issue-details.test.ts`
- `packages/domain/issues/src/use-cases/remove-score-from-issue.test.ts`
- `packages/domain/issues/src/use-cases/resolve-matched-issue.test.ts`
- `packages/domain/issues/src/use-cases/sync-projections.test.ts`
- `packages/domain/issues/src/testing/fake-issue-repository.ts` (no structural change; just ensure callers pass `source`)

Platform / apps:
- `packages/platform/db-postgres/src/repositories/issue-repository.test.ts`
- `apps/api/src/routes/scores.test.ts`
- `apps/workers/src/workers/trace-end.test.ts`

This list is exhaustive — grepping for `makeIssue`, `makeIssueRow`, and direct `issueSchema.parse(` calls is the safest way to confirm coverage before running typecheck.

### 9. Web API records — `apps/web/src/domains/issues/issues.functions.ts`

Thread `source` through the record serializers:

- `toIssueRecord` — add `source: issue.source`
- `toIssueSummaryRecord` — add `source: issue.source`
- `toIssueDetailRecord` — add `source: issue.source`

### 10. List issues use-case — `packages/domain/issues/src/use-cases/list-issues.ts`

Add `source: IssueSource` to `IssueListItem` (use the strong type — the union has only three members, so weakening to `string` would be gratuitous) and thread it through from `Issue` to the result items.

### 11. Weaviate projection — no change

The `source` field is for Postgres provenance / filtering only. It is not part of the searchable Weaviate projection. The `IssuesCollection` type and `IssueProjectionRepository` interfaces remain unchanged.

### 12. Documentation — `docs/issues.md`

Add a short section under the Issue entity description documenting the `source` field, its three possible values, and the derivation rule from the creating score.

## Edge Cases

- **Deterministic-only strategies** (`tool-call-errors`, `output-schema-validation`, `empty-response`) write `source: "annotation"`, `sourceId: "SYSTEM"` via `handleMatched` in `process-deterministic-flaggers.ts` — correctly mapped to `"flagger"`.
- **LLM flagger workflow** writes drafts with `sourceId: <queueId>`, not `"SYSTEM"`. If a human later publishes that draft and it creates a new issue, the issue source is `"annotation"` (correct — a human confirmed it).
- **Existing issues with no linked scores** (should not exist, but handled by migration default `"annotation"`).
- **Concurrent `createIssueFromScore` attempts** for the same score are idempotent — the `source` is always derived from the same score, so racing transactions see the same value.

## Roll-out Sequence

| Step | Action |
|------|--------|
| 1 | Land domain model + constants + creation logic changes |
| 2 | Land schema + repository + migration |
| 3 | Run `pg:migrate` in all environments |
| 4 | Land seed fixture + test helper updates |
| 5 | Land web layer record updates |
| 6 | Update `docs/issues.md` |
