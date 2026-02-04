/** Base error for agent-sdk failures. */
export class AgentSdkError extends Error {
  name = 'AgentSdkError'
}

/** Thrown when no model is configured or resolved. */
export class MissingModelError extends AgentSdkError {
  name = 'MissingModelError'
}

/** Thrown when the model cannot be resolved via models.dev. */
export class UnknownModelError extends AgentSdkError {
  name = 'UnknownModelError'
}

/** Thrown when a PromptL tool has no runtime handler. */
export class MissingToolHandlerError extends AgentSdkError {
  name = 'MissingToolHandlerError'
}

/** Thrown when a PromptL prompt uses <step> tags. */
export class StepsNotSupportedError extends AgentSdkError {
  name = 'StepsNotSupportedError'
}

/** Thrown when a registry-backed loader is required but missing. */
export class MissingRegistryError extends AgentSdkError {
  name = 'MissingRegistryError'
}

/** Thrown when a prompt file cannot be loaded. */
export class PromptNotFoundError extends AgentSdkError {
  name = 'PromptNotFoundError'
}

/** Thrown when provider credentials are missing or invalid. */
export class ProviderAuthError extends AgentSdkError {
  name = 'ProviderAuthError'
}

/** Thrown when a provider is not supported by the runtime. */
export class UnsupportedProviderError extends AgentSdkError {
  name = 'UnsupportedProviderError'
}
