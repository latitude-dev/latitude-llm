import type { ApiKeyId as ApiKeyIdType, NotFoundError, RepositoryError } from "@domain/shared"
import { EffectService } from "@repo/effect-service"
import type { Effect } from "effect"
import type { ApiKey } from "../entities/api-key.ts"

// ApiKeyRepository Service with all methods needed by use cases
export class ApiKeyRepository extends EffectService<
  ApiKeyRepository,
  {
    findById: (id: ApiKeyIdType) => Effect.Effect<ApiKey, NotFoundError | RepositoryError>
    list: () => Effect.Effect<readonly ApiKey[], RepositoryError>
    save: (apiKey: ApiKey) => Effect.Effect<void, RepositoryError>
    delete: (id: ApiKeyIdType) => Effect.Effect<void, RepositoryError>
    touch: (id: ApiKeyIdType) => Effect.Effect<void, RepositoryError>
    findByTokenHash: (tokenHash: string) => Effect.Effect<ApiKey, NotFoundError | RepositoryError>
    touchBatch: (ids: readonly ApiKeyIdType[]) => Effect.Effect<void, RepositoryError>
  }
>()("@domain/api-keys/ApiKeyRepository") {}
