# Repository ports and method naming

Domain repository **ports** live under `packages/domain/*/src/ports/`. Platform packages implement them in `packages/platform/*`. This document defines the **vocabulary** for method names on those ports so callers can infer behavior without reading SQL.

Full detail on SqlClient, RLS, and mappers remains in [.agents/skills/database-postgres/SKILL.md](../.agents/skills/database-postgres/SKILL.md).

## Standard verbs


| Pattern                                                                            | Meaning                                                                                                                                                                       | Result shape                                   | Typical errors                                                                                               |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `**findById`**                                                                     | Exactly one row by primary id                                                                                                                                                 | `Effect<Entity, E, R>`                         | `**NotFoundError**` (or domain-specific not-found) when missing; never return `null` for a missing row       |
| `**findByXxx**`                                                                    | At most one row by a unique business key (slug, email, token hash, composite unique key)                                                                                      | `Effect<Entity, E, R>`                         | `**NotFoundError**` (or domain-specific not-found) when missing                                              |
| `**listByXxx**`                                                                    | Zero or more rows filtered by `Xxx` (or by scoped criteria such as `projectId`)                                                                                               | `Effect<readonly Entity[]                      | Page, E, R>`                                                                                                 |
| `**list**`                                                                         | Paginated or filtered collection query when there is no single dominant filter name                                                                                           | `Effect<Page, E, R>`                           | Usually `RepositoryError` only                                                                               |
| `**save**`                                                                         | Canonical repository write verb. Use for full-row writes, append-only writes, and upserts; use `**saveBatch**` for bulk writes instead of introducing separate `insert` verbs | `Effect<void, E, R>` or `Effect<Entity, E, R>` | `RepositoryError`, domain validation errors                                                                  |
| `**create**`                                                                       | Acceptable only when create-only semantics are materially different from `**save**` (e.g. server-generated defaults, distinct return shape)                                   | `Effect<Entity, E, R>`                         | Prefer `**save**` when create and update share one code path                                                 |
| `**updateXxx**` / `**updateRow**`                                                  | Partial, field-scoped, or batch updates that are not full aggregate replacement                                                                                               | `Effect<…, E, R>`                              | Domain not-found / validation                                                                                |
| `**delete**`                                                                       | Hard delete (row removed or irreversible)                                                                                                                                     | `Effect<void, E, R>`                           | `NotFoundError` when applicable                                                                              |
| `**softDelete**`                                                                   | Sets tombstone / `deletedAt` (entity may still appear in admin or audit queries)                                                                                              | `Effect<void, E, R>`                           | `NotFoundError` when applicable                                                                              |
| `**existsByXxx**`                                                                  | Boolean existence check without loading the entity                                                                                                                            | `Effect<boolean, E, R>`                        | Usually `RepositoryError` only                                                                               |
| `**countByXxx**`                                                                   | Scalar count for filters / metrics                                                                                                                                            | `Effect<number, E, R>`                         | Usually `RepositoryError` only                                                                               |
| `**aggregateByXxx**` / `**rollupByXxx**` / `**trendByXxx**` / `**histogramByXxx**` | Analytical reads (often ClickHouse)                                                                                                                                           | Typed DTOs                                     | Usually `RepositoryError` only; use `**zero-filled**` aggregates when the query matches no rows (not `null`) |
| `**upsert**`                                                                       | External index or projection store (e.g. vector DB) where merge-by-key is the only write                                                                                      | `Effect<void, E, R>`                           | `RepositoryError`                                                                                            |


### Rules of thumb

1. `**findBy*` returns one or zero** — If the method can return multiple rows, name it `**listBy*`** (or `**list**`) instead of `**findBy***`.
2. **Do not use `findAll` for collections** — Prefer `**list`** or `**listByXxx**` so the filter dimension stays explicit (`listByProject`, `listByOrganizationId`, etc.).
3. **Deletion must be explicit** — Use `**delete`** vs `**softDelete**` in the name so hard vs soft removal is obvious.
4. **Effect error channel** — Missing entities use `**NotFoundError`** (from `@domain/shared`) or a domain-specific tagged error with the same HTTP semantics. Boundaries may map `NotFoundError` to optional UX (e.g. `catchTag("NotFoundError", () => succeed(null))`) when the product contract requires absence instead of 404.
5. **Repository writes should converge on `save`** — Prefer `**save**` / `**saveBatch**` over `**insert**` / `**insertBatch**`; treat the remaining `insert`-named repository methods as cleanup TODOs.

## Example port (illustrative)

```typescript
// Postgres-backed aggregate
interface WidgetRepository {
  findById(id: WidgetId): Effect.Effect<Widget, NotFoundError | RepositoryError>
  findBySlug(slug: string): Effect.Effect<Widget, NotFoundError | RepositoryError>
  listByProjectId(args: { projectId: ProjectId; limit?: number }): Effect.Effect<
    readonly Widget[],
    RepositoryError
  >
  save(widget: Widget): Effect.Effect<void, RepositoryError>
  softDelete(id: WidgetId): Effect.Effect<void, NotFoundError | RepositoryError>
}
```

## Audit: domain repository ports (AGE-47)

The following lists **current** port methods in `packages/domain/*/src/ports/*repository*.ts` against the vocabulary above. Update this section when you add or rename port methods.

### Compliant or intentionally specialized

- **ProjectRepository** — `findById`, `findBySlug`, `list`, `listIncludingDeleted`, `save`, `softDelete`, `hardDelete`, `existsByName`, `existsBySlug`.
- **DatasetRepository** — `findById`, `listByProject`, `softDelete`, `save` split into `create` / `updateName` / … is acceptable for partial updates.
- **ScoreRepository** — `findById` → `NotFoundError` if missing; `listBy`*, `save`, `delete`, `assignIssueIfUnowned`, plus specialized `existsByEvaluationIdAndScope` / `existsByEvaluationIdAndTraceId` reads for live-monitoring canonical-state checks.
- **IssueProjectionRepository** — `upsert`, `delete`, `hybridSearch` (projection store).
- **InvitationRepository** — `findPublicPendingPreviewById` → `NotFoundError` if missing, invalid, or expired (unauthenticated preview).
- **UserRepository** — `findByEmail`, `setNameIfMissing`, `delete`.
- **ApiKeyRepository** — `list`, `findById`, `findByTokenHash`, `save`, `delete`, `touch`, `touchBatch`.
- **OrganizationRepository** — `listByUserId` for many orgs per user.
- **MembershipRepository** — `listByOrganizationId`, `listByUserId`, `listMembersWithUser`.
- **IssueRepository** — `findById`, `findByIdForUpdate`, `findByUuid` → `NotFoundError` if missing.
- **TraceRepository** / **SessionRepository** — `listByProjectId`, `listByTraceIds` (trace only), `countByProjectId`, `aggregateMetricsByProjectId` (zero-filled when no rows), `histogramByProjectId` (trace only), `distinctFilterValues`; **TraceRepository** `findByTraceId` → `NotFoundError` if missing, plus specialized `matchesFiltersByTraceId` for boolean reuse of the canonical trace filter semantics on one known trace.
- **SpanRepository** — `listByTraceId`, `listByProjectId`; `findBySpanId` → `NotFoundError` if missing.

### Pending repository verb cleanup

- **DatasetRowRepository** — current `**insertBatch`** should converge to `**saveBatch**`; the remaining methods (`list`, `listPage`, `count`, `findById`, `updateRow`, `deleteBatch`, `deleteAll`) already fit the vocabulary.
- **ScoreAnalyticsRepository** — current `**insert`** should converge to `**save**`; `delete`, `aggregateBy*`, `rollupBy*`, and `trendBy*` remain intentionally specialized analytics verbs.
- **SpanRepository** — current `**insert`** should converge to `**save**`; the append-only semantics can stay the same while the repository verb vocabulary is normalized.

---

When you add or rename repository methods, update this audit table in the same change.