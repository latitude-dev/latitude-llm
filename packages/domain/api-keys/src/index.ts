export {
  createApiKey,
  generateApiKeyToken,
  isActive,
  revoke,
  touch,
  type ApiKey,
} from "./entities/api-key.ts"

export type { ApiKeyRepository } from "./ports/api-key-repository.ts"
export type { UnscopedApiKeyRepository } from "./ports/unscoped-api-key-repository.ts"

export { createApiKeyCreatedEvent, type ApiKeyCreatedEvent } from "./events/api-key-created.ts"

export {
  generateApiKeyUseCase,
  InvalidApiKeyNameError,
  type GenerateApiKeyInput,
  type GenerateApiKeyError,
} from "./use-cases/generate-api-key.ts"

export {
  revokeApiKeyUseCase,
  ApiKeyNotFoundError,
  ApiKeyAlreadyRevokedError,
  type RevokeApiKeyInput,
  type RevokeApiKeyError,
  type RevokeApiKeyDeps,
  type CacheInvalidator,
} from "./use-cases/revoke-api-key.ts"
