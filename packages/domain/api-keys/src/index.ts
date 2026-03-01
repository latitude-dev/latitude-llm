export {
  createApiKey,
  generateApiKeyToken,
  isActive,
  revoke,
  touch,
  type ApiKey,
} from "./entities/api-key.js";

export type { ApiKeyRepository } from "./ports/api-key-repository.js";

export { createApiKeyCreatedEvent, type ApiKeyCreatedEvent } from "./events/api-key-created.js";

export {
  generateApiKeyUseCase,
  InvalidApiKeyNameError,
  type GenerateApiKeyInput,
  type GenerateApiKeyError,
} from "./use-cases/generate-api-key.js";

export {
  revokeApiKeyUseCase,
  ApiKeyNotFoundError,
  ApiKeyAlreadyRevokedError,
  type RevokeApiKeyInput,
  type RevokeApiKeyError,
} from "./use-cases/revoke-api-key.js";
