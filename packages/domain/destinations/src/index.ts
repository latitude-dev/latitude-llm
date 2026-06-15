// Constants
export {
  DESTINATION_EVENT_UUID_NAMESPACE,
  DESTINATION_IDLE_BACKOFF_MAX_MS,
  DESTINATION_INTERVAL_MS_DEFAULT,
  DESTINATION_INTERVAL_MS_MAX,
  DESTINATION_INTERVAL_MS_MIN,
  DESTINATION_MAX_EVENT_BYTES_DEFAULT,
  DESTINATION_MAX_SPANS_PER_RUN_DEFAULT,
  DESTINATION_MAX_SPANS_PER_RUN_MAX,
  DESTINATION_MAX_SPANS_PER_RUN_MIN,
  DESTINATION_QUARANTINE_FAILURE_THRESHOLD,
  POSTHOG_EU_INGESTION_HOST,
  POSTHOG_US_INGESTION_HOST,
} from "./constants.ts"
// Entities
export type {
  Destination,
  DestinationConfig,
  DestinationCredentials,
  DestinationKind,
  DestinationStatus,
  PosthogDestinationConfig,
  PosthogDestinationCredentials,
} from "./entities/destination.ts"
export {
  createDestination,
  DESTINATION_KINDS,
  DESTINATION_STATUSES,
  destinationConfigSchema,
  destinationCredentialsSchema,
  destinationHostSchema,
  destinationKindSchema,
  destinationSchema,
  destinationStatusSchema,
  posthogDestinationConfigSchema,
  posthogDestinationCredentialsSchema,
} from "./entities/destination.ts"
export type { DestinationEvent } from "./entities/destination-event.ts"
export type { DestinationSyncRun, DestinationSyncRunStatus } from "./entities/destination-sync-run.ts"
export {
  createDestinationSyncRun,
  DESTINATION_SYNC_RUN_STATUSES,
  destinationSyncRunSchema,
  destinationSyncRunStatusSchema,
} from "./entities/destination-sync-run.ts"
// Errors
export type { DeliveryError } from "./errors.ts"
export {
  isRetryableDeliveryError,
  NonRetryableDeliveryError,
  RetryableDeliveryError,
  SandboxOrganizationDestinationError,
} from "./errors.ts"
// Helpers
export { uuidV5 } from "./helpers.ts"

// Mappers
export type {
  MapSpansToPosthogEventsInput,
  MapSpansToPosthogEventsResult,
  PosthogEventName,
} from "./mappers/posthog.ts"
export {
  mapSpansToPosthogEvents,
  POSTHOG_CONTENT_PROPERTIES,
  POSTHOG_EVENT_NAMES,
  posthogRedactionSet,
} from "./mappers/posthog.ts"

// Ports
export type {
  DeliveryContext,
  DeliveryResult,
  DeliveryWindow,
  DestinationDeliverer,
  DestinationDelivererRegistry,
} from "./ports/destination-deliverer.ts"
export { DestinationDeliverers } from "./ports/destination-deliverer.ts"
export type {
  AdvanceDestinationCursorInput,
  DestinationCursor,
  DestinationRepositoryShape,
} from "./ports/destination-repository.ts"
export { DestinationRepository } from "./ports/destination-repository.ts"
export type {
  DestinationSyncRunRepositoryShape,
  ListSyncRunsByDestinationIdInput,
} from "./ports/destination-sync-run-repository.ts"
export { DestinationSyncRunRepository } from "./ports/destination-sync-run-repository.ts"

// Use cases
export type { CreateDestinationError, CreateDestinationInput } from "./use-cases/create-destination.ts"
export { createDestinationUseCase } from "./use-cases/create-destination.ts"
