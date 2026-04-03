# Repository ports and method naming

Domain repository **ports** live under `packages/domain/*/src/ports/`. Platform packages implement them in `packages/platform/*`. This document defines the **vocabulary** for method names on those ports so callers can infer behavior without reading SQL.

Full detail on SqlClient, RLS, and mappers remains in [.agents/skills/database-postgres/SKILL.md](../.agents/skills/database-postgres/SKILL.md).

## Standard verbs

| Pattern | Meaning | Result shape | Typical errors |
| --- | --- | --- | --- |
| **`findById`** | Exactly one row by primary id | `Effect<Entity, E, R>` | Prefer **`NotFoundError`** (or domain-specific not-found) when missing — avoid nullable entity returns on new ports |
| **`findByXxx`** | At most one row by a **unique** business key (slug, email, token hash, composite unique key) | `Effect<Entity, E, R>` | Same as `findById` when the key must exist; use ` \| null` only for intentional optional lookups (legacy — converge on not-found errors) |
| **`listByXxx`** | Zero or more rows filtered by `Xxx` (or by scoped criteria such as `projectId`) | `Effect<readonly Entity[] \| Page, E, R>` | Usually `RepositoryError` only |
| **`list`** | Paginated or filtered collection query when there is no single dominant filter name | `Effect<Page, E, R>` | Usually `RepositoryError` only |
| **`save`** | Insert or update the aggregate / row (upsert or equivalent) | `Effect<void, E, R>` or `Effect<Entity, E, R>` | `RepositoryError`, domain validation errors |
| **`create`** | Acceptable when insert-only is materially different from `save` (e.g. server-generated defaults, distinct return shape) | `Effect<Entity, E, R>` | Prefer `save` when create and update share one code path |
| **`updateXxx` / `updateRow`** | Partial, field-scoped, or batch updates that are **not** full aggregate replacement | `Effect<…, E, R>` | Domain not-found / validation |
| **`delete`** | Hard delete (row removed or irreversible) | `Effect<void, E, R>` | `NotFoundError` when applicable |
| **`softDelete`** | Sets tombstone / `deletedAt` (entity may still appear in admin or audit queries) | `Effect<void, E, R>` | `NotFoundError` when applicable |
| **`existsByXxx`** | Boolean existence check without loading the entity | `Effect<boolean, E, R>` | Usually `RepositoryError` only |
| **`countByXxx`** | Scalar count for filters / metrics | `Effect<number, E, R>` | Usually `RepositoryError` only |
| **`aggregateByXxx` / `rollupByXxx` / `trendByXxx` / `histogramByXxx`** | Analytical reads (often ClickHouse) | Typed DTOs | Usually `RepositoryError` only |
| **`insert` / `insertBatch`** | Append-only or bulk append (telemetry, analytics mirrors) | `Effect<void \| Ids, E, R>` | Prefer when there is **no** update path for the same store |
| **`upsert`** | External index or projection store (e.g. vector DB) where merge-by-key is the only write | `Effect<void, E, R>` | `RepositoryError` |

### Rules of thumb

1. **`findBy*` returns one or zero** — If the method can return **multiple** rows, name it **`listBy*`** (or **`list`**) instead of `findBy*`.
2. **Do not use `findAll` for collections** — Prefer **`list`** or **`listByXxx`** so the filter dimension stays explicit (`listByProject`, `listByOrganizationId`, etc.).
3. **Deletion must be explicit** — Use **`delete`** vs **`softDelete`** in the name so hard vs soft removal is obvious.
4. **Effect error channel** — Prefer typed `NotFoundError` (or domain not-found) for missing required entities; reserve `Entity \| null` for legacy ports until they are migrated.

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
- **DatasetRowRepository** — `list`, `listPage`, `count`, `findById`, `insertBatch`, `updateRow`, `deleteBatch`, `deleteAll`.
- **ScoreRepository** — `listBy*`, `save`, `delete`, `assignIssueIfUnowned`.
- **ScoreAnalyticsRepository** — `insert`, `delete` (row mask); `aggregateBy*`, `rollupBy*`, `trendBy*`.
- **IssueProjectionRepository** — `upsert`, `delete`, `hybridSearch` (projection store).
- **InvitationRepository** — `findPublicPendingPreviewById` (descriptive single-object read).
- **UserRepository** — `findByEmail`, `setNameIfMissing`, `delete`.
- **ApiKeyRepository** — `list`, `findById`, `findByTokenHash`, `save`, `delete`, `touch`, `touchBatch`.
- **OrganizationRepository** — `listByUserId` for many orgs per user.
- **MembershipRepository** — `listByOrganizationId`, `listByUserId`, `listMembersWithUser`.
- **TraceRepository** / **SessionRepository** — `listByProjectId`, `listByTraceIds` (trace only), `countByProjectId`, `aggregateMetricsByProjectId`, `histogramByProjectId` (trace only), `distinctFilterValues`; **TraceRepository** also `findByTraceId` (single trace detail, nullable).
- **SpanRepository** — `listByTraceId`, `listByProjectId` for collections; `findBySpanId` for optional single-span detail.

### Nullable `findById` / optional lookup (legacy)

These return `null` instead of `NotFoundError` for missing rows. **New** methods should use typed not-found errors; migrate when convenient.

- **IssueRepository** — `findById`, `findByIdForUpdate`, `findByUuid`
- **ScoreRepository** — `findById`
- **SpanRepository** — `findBySpanId` (optional detail — name may stay `find*` if treated as optional)

---

When you add or rename repository methods, update this audit table in the same change.
