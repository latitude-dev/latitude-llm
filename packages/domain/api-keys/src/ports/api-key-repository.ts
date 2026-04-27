import type { ApiKeyId as ApiKeyIdType, NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import type { Effect } from "effect"
import { Context } from "effect"
import type { ApiKey } from "../entities/api-key.ts"

// ApiKeyRepository Service with all methods needed by use cases
export class ApiKeyRepository extends Context.Service<
  ApiKeyRepository,
  {
    findById: (id: ApiKeyIdType) => Effect.Effect<ApiKey, NotFoundError | RepositoryError, SqlClient>
    list: () => Effect.Effect<readonly ApiKey[], RepositoryError, SqlClient>
    save: (apiKey: ApiKey) => Effect.Effect<void, RepositoryError, SqlClient>
    delete: (id: ApiKeyIdType) => Effect.Effect<void, RepositoryError, SqlClient>
    touch: (id: ApiKeyIdType) => Effect.Effect<void, RepositoryError, SqlClient>
    findByTokenHash: (tokenHash: string) => Effect.Effect<ApiKey, NotFoundError | RepositoryError, SqlClient>
    touchBatch: (ids: readonly ApiKeyIdType[]) => Effect.Effect<void, RepositoryError, SqlClient>
  }
>()("@domain/api-keys/ApiKeyRepository") {}
