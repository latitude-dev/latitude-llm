# Effect services in this repository

Mintlify preview (PR checks) expects a root `docs.json`; this file is included in navigation under **Platform & tooling** below.

This document describes how domain and platform **service tags** are defined, and how that maps to upstream Effect naming when the catalog `effect` version moves.

## Current pattern: `EffectService` (`@repo/effect-service`)

The Effect 4 line still implements class-style tags as `ServiceMap.Service` on the `effect` package. To align call sites with [effect-smol migration docs](https://github.com/Effect-TS/effect-smol/blob/main/migration/services.md) (`Context.Service`), the monorepo uses a single alias:

- **Package:** `packages/effect-service` → import `EffectService` from `@repo/effect-service`.
- **Implementation:** `EffectService` is `ServiceMap.Service` today; if upstream exposes `Context.Service`, update **only** `packages/effect-service/src/index.ts`.

**Class-style tags** (ports such as `SqlClient`, repository tags):

```ts
import { EffectService } from "@repo/effect-service"

export class SqlClient extends EffectService<SqlClient, SqlClientShape>()("@domain/shared/SqlClient") {}
```

**Providing** uses `Layer.succeed(Tag, impl)` or `Layer.effect(Tag, …)` (e.g. `SqlClientLive` in `@platform/db-postgres`).

**Consuming** uses `yield* SqlClient` in `Effect.gen`, or `Effect.service(SqlClient)` where appropriate.

## Upstream rename (effect-smol migration)

| Historical / informal | v4 (effect-smol docs) | This repo |
| --- | --- | --- |
| `Context.Tag` / `Effect.Tag` class | `Context.Service<…>()(id)` | `extends EffectService<…>()(id)` |
| `Effect.Service` with `effect` + `dependencies` | `Context.Service` with `make` + explicit `Layer` | N/A (platform uses `Layer.effect`) |

When bumping catalog `effect`, first adjust **`@repo/effect-service`** if the symbol moves (e.g. `Context.Service`); call sites should stay on `EffectService`.

## Inventory: class-style service tags

Grep for `extends EffectService` under `packages/` (and update this list when adding ports):

- **@repo/effect-service**: alias definition only
- **@domain/shared**: `sql-client.ts`, `ch-sql-client.ts`, `cache.ts`, `storage.ts`, `settings.ts`, `outbox-event-writer.ts`
- **@domain/projects**: `project-repository.ts`
- **@domain/organizations**: `membership-repository.ts`, `organization-repository.ts`, `invitation-repository.ts`
- **@domain/users**: `user-repository.ts`
- **@domain/api-keys**: `api-key-repository.ts`, `revoke-api-key.ts` (`ApiKeyCacheInvalidator`)
- **@domain/annotation-queues**: `annotation-queue-repository.ts`, `annotation-queue-item-repository.ts`
- **@domain/datasets**: `dataset-repository.ts`, `dataset-row-repository.ts`
- **@domain/issues**: `issue-repository.ts`, `issue-projection-repository.ts`
- **@domain/scores**: `score-repository.ts`, `score-analytics-repository.ts`
- **@domain/spans**: `span-repository.ts`, `trace-repository.ts`, `session-repository.ts`
- **@domain/ai**: `index.ts` (AI / embed / rerank / generate tags)
- **@domain/queue**: `index.ts` (`QueuePublisher`)
- **@platform/db-weaviate**: `wv-query-client.ts`
- **@platform/cache-redis**: `index.ts` (`RedisCacheAdapterTag`)

## SqlClient-specific notes

- **Definition:** `packages/domain/shared/src/sql-client.ts` — `SqlClientShape` is the port; `SqlClient` is the tag.
- **Live implementation:** `packages/platform/db-postgres/src/sql-client.ts` — `SqlClientLive` returns `Layer.effect(SqlClient, …)`.
- **Tests:** `packages/platform/db-postgres/src/sql-client.test.ts` exercises the live adapter; `packages/domain/shared/src/sql-client.test.ts` asserts tag + `Layer.succeed` resolution for the shared contract.
