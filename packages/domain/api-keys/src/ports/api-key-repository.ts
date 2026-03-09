import type { ApiKeyId, NotFoundError, RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import type { ApiKey } from "../entities/api-key.ts"

export class ApiKeyRepository extends ServiceMap.Service<
  ApiKeyRepository,
  {
    findById(id: ApiKeyId): Effect.Effect<ApiKey, NotFoundError | RepositoryError>
    findAll(): Effect.Effect<readonly ApiKey[], RepositoryError>
    save(apiKey: ApiKey): Effect.Effect<void, RepositoryError>
    delete(id: ApiKeyId): Effect.Effect<void, RepositoryError>
    touch(id: ApiKeyId): Effect.Effect<void, RepositoryError>
  }
>()("@domain/api-keys/ApiKeyRepository") {}
