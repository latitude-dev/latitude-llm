# Effect services in this repository

This document describes how domain and platform **service tags** are defined today, and how that maps to upstream Effect naming so we can migrate deliberately when the catalog Effect version moves.

## Current stack (Effect 4.0 beta in the monorepo)

The workspace pins **Effect 4** (see `pnpm-workspace.yaml` catalog entry for `effect`). In that line, the public API for typed service identifiers is **`ServiceMap.Service`**, not `Effect.Service`.

- **Class-style tags** (the pattern used for `SqlClient`, repository ports, and most domain services):

  ```ts
  import { ServiceMap } from "effect"

  export class SqlClient extends ServiceMap.Service<SqlClient, SqlClientShape>()("@domain/shared/SqlClient") {}
  ```

- **Providing implementations** uses `Layer.succeed(Tag, impl)` or `Layer.effect(Tag, …)` as in `@platform/db-postgres` (`SqlClientLive`).

- **Consuming** uses `yield* SqlClient` inside `Effect.gen`, or `Effect.service(SqlClient)` where appropriate.

So the Linear/GitHub wording “`Effect.Service`” refers to the **concept** of a typed Effect service (tag + shape + `Layer` wiring). The **concrete constructor** in our pinned Effect package is `ServiceMap.Service`.

## Upstream rename (effect-smol migration)

The [effect-smol services migration guide](https://github.com/Effect-TS/effect-smol/blob/main/migration/services.md) describes the next naming:

| Historical / informal | v4 (effect-smol docs) | This repo today |
| --- | --- | --- |
| `Context.Tag` / `Effect.Tag` class | `Context.Service<…>()(id)` | `ServiceMap.Service<…>()(id)` |
| `Effect.Service` with `effect` + `dependencies` | `Context.Service` with `make` + explicit `Layer` | N/A (we use `Layer.effect` at the platform boundary) |

When the catalog `effect` version is upgraded, expect the **module path and name** of the service constructor to follow that migration (e.g. `Context` vs `ServiceMap`). The **mechanical code changes** are then:

1. Replace the import and base class for each `extends ServiceMap.Service<…>()("…")` tag.
2. Keep the same **string id** (e.g. `"@domain/shared/SqlClient"`) unless upstream requires otherwise, so `Layer` wiring stays aligned.
3. Run the full typecheck and tests; behavior should be unchanged if only the tag API moved.

## Inventory: `ServiceMap.Service` class extensions

The following files define services with `extends ServiceMap.Service` (grep the repo for that substring when updating this list):

- **@domain/shared**: `sql-client.ts`, `ch-sql-client.ts`, `cache.ts`, `storage.ts`, `settings.ts`, `outbox-event-writer.ts`
- **@domain/projects**: `project-repository.ts` (ports)
- **@domain/organizations**: `membership-repository.ts`, `organization-repository.ts`, `invitation-repository.ts` (ports)
- **@domain/users**: `user-repository.ts` (ports)
- **@domain/api-keys**: `api-key-repository.ts`, `revoke-api-key.ts`
- **@domain/annotation-queues**: `annotation-queue-repository.ts`, `annotation-queue-item-repository.ts` (ports)
- **@domain/datasets**: `dataset-repository.ts`, `dataset-row-repository.ts` (ports)
- **@domain/issues**: `issue-repository.ts`, `issue-projection-repository.ts` (ports)
- **@domain/scores**: `score-repository.ts`, `score-analytics-repository.ts` (ports)
- **@domain/spans**: `span-repository.ts`, `trace-repository.ts`, `session-repository.ts` (ports)
- **@domain/ai**: `index.ts` (several tags)
- **@domain/queue**: `index.ts`
- **@platform/db-weaviate**: `wv-query-client.ts`
- **@platform/cache-redis**: `index.ts`

**Migration plan:** When bumping the catalog `effect` version, treat “rename `ServiceMap.Service` → upstream `Context.Service` (or equivalent)” as **one coordinated PR** across these files (or a small sequence of PRs by package), plus a full `pnpm typecheck` and targeted tests for `SqlClient` / repository layers.

## SqlClient-specific notes

- **Definition:** `packages/domain/shared/src/sql-client.ts` — `SqlClientShape` is the port; `SqlClient` is the tag.
- **Live implementation:** `packages/platform/db-postgres/src/sql-client.ts` — `SqlClientLive` returns `Layer.effect(SqlClient, …)`.
- **Tests:** `packages/platform/db-postgres/src/sql-client.test.ts` exercises the live adapter; `packages/domain/shared/src/sql-client.test.ts` asserts tag + `Layer.succeed` resolution for the shared contract.
