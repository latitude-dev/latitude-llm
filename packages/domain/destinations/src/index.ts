// Constants
export {
  DESTINATION_EVENT_UUID_NAMESPACE,
  DESTINATION_IDLE_BACKOFF_MAX_MS,
  DESTINATION_INTERVAL_MS_DEFAULT,
  DESTINATION_INTERVAL_MS_MAX,
  DESTINATION_INTERVAL_MS_MIN,
  DESTINATION_MAX_EVENT_BYTES_DEFAULT,
  DESTINATION_MAX_RECORDS_PER_RUN_DEFAULT,
  DESTINATION_MAX_RECORDS_PER_RUN_MAX,
  DESTINATION_MAX_RECORDS_PER_RUN_MIN,
  DESTINATION_PRUNE_KEY,
  DESTINATION_PRUNE_PATTERN,
  DESTINATION_QUARANTINE_FAILURE_THRESHOLD,
  DESTINATION_SAFETY_LAG_MS,
  DESTINATION_SWEEPER_KEY,
  DESTINATION_SWEEPER_PATTERN,
  DESTINATION_SYNC_MAX_ATTEMPTS,
  DESTINATION_SYNC_RETRY_BACKOFF_MS,
  DESTINATION_SYNC_RUN_RETENTION_MS,
  POSTHOG_EU_INGESTION_HOST,
  POSTHOG_US_INGESTION_HOST,
} from "./constants.ts"
// Helpers
export { previewCredentials } from "./credentials-preview.ts"
// Entities
export type {
  Destination,
  DestinationConfig,
  DestinationConfigPatch,
  DestinationCredentials,
  DestinationKind,
  DestinationKindMeta,
  DestinationStatus,
  PosthogDestinationConfig,
  PosthogDestinationCredentials,
} from "./entities/destination.ts"
export {
  createDestination,
  DESTINATION_KIND_META,
  DESTINATION_KINDS,
  DESTINATION_STATUSES,
  destinationConfigPatchSchema,
  destinationConfigSchema,
  destinationCredentialsSchema,
  destinationHostSchema,
  destinationKindSchema,
  destinationSchema,
  destinationStatusSchema,
  posthogDestinationConfigSchema,
  posthogDestinationCredentialsSchema,
  supportedSourcesForKind,
} from "./entities/destination.ts"
export type { DestinationEvent } from "./entities/destination-event.ts"
export type {
  DestinationSource,
  DestinationSourceConfig,
  DestinationSourceConfigPatch,
  DestinationSourceStatus,
  SpansSourceConfig,
} from "./entities/destination-source.ts"
export {
  DESTINATION_SOURCE_STATUSES,
  DESTINATION_SOURCES,
  defaultSourceConfig,
  destinationSourceConfigPatchSchema,
  destinationSourceConfigSchema,
  destinationSourceSchema,
  destinationSourceStatusSchema,
  spansSourceConfigSchema,
} from "./entities/destination-source.ts"
export type { DestinationSourceState } from "./entities/destination-source-state.ts"
export {
  createDestinationSourceState,
  destinationSourceStateSchema,
} from "./entities/destination-source-state.ts"
export type {
  DestinationSyncRun,
  DestinationSyncRunStatus,
} from "./entities/destination-sync-run.ts"
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
export { uuidV5 } from "./helpers.ts"

// Mappers
export type {
  MapSpansToPosthogEventsInput,
  MapSpansToPosthogEventsResult,
  PosthogEventName,
} from "./mappers/posthog.ts"
export {
  createPosthogMapper,
  mapSpansToPosthogEvents,
  POSTHOG_CONTENT_PROPERTIES,
  POSTHOG_EVENT_NAMES,
  posthogExcludedProperties,
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
  DestinationMapper,
  DestinationMapperRegistry,
  MappedEvents,
} from "./ports/destination-mapper.ts"
export { DestinationMappers } from "./ports/destination-mapper.ts"
export type {
  DestinationRepositoryShape,
  UpdateDestinationQuarantineStateInput,
} from "./ports/destination-repository.ts"
export { DestinationRepository } from "./ports/destination-repository.ts"
export type {
  DestinationSourceReader,
  DestinationSourceReaderRegistry,
  SourceCursor,
  SourceWindow,
} from "./ports/destination-source-reader.ts"
export { DestinationSourceReaders } from "./ports/destination-source-reader.ts"
export type {
  AdvanceSourceCursorInput,
  DestinationSourceStateRepositoryShape,
  DueDestinationSource,
  UpdateSourceConfigInput,
  UpdateSourceRunStateInput,
} from "./ports/destination-source-state-repository.ts"
export { DestinationSourceStateRepository } from "./ports/destination-source-state-repository.ts"
export type {
  DestinationSyncRunCursor,
  DestinationSyncRunRepositoryShape,
  ListSyncRunsByDestinationIdInput,
} from "./ports/destination-sync-run-repository.ts"
export { DestinationSyncRunRepository } from "./ports/destination-sync-run-repository.ts"
// Sources (v1 spans binding)
export { createSpansSourceReader, SpansSourceReadersLive } from "./sources/spans-source-reader.ts"

// Use cases
export type {
  CreateDestinationError,
  CreateDestinationInput,
} from "./use-cases/create-destination.ts"
export { createDestinationUseCase } from "./use-cases/create-destination.ts"
export type {
  DeleteDestinationError,
  DeleteDestinationInput,
} from "./use-cases/delete-destination.ts"
export { deleteDestinationUseCase } from "./use-cases/delete-destination.ts"
export type {
  DeleteProjectDestinationsError,
  DeleteProjectDestinationsInput,
} from "./use-cases/delete-project-destinations.ts"
export { deleteProjectDestinationsUseCase } from "./use-cases/delete-project-destinations.ts"
export type {
  PauseDestinationError,
  PauseDestinationInput,
} from "./use-cases/pause-destination.ts"
export { pauseDestinationUseCase } from "./use-cases/pause-destination.ts"
export type {
  PreviewDestinationDeliveryInput,
  PreviewDestinationDeliveryResult,
} from "./use-cases/preview-destination-delivery.ts"
export { previewDestinationDeliveryUseCase } from "./use-cases/preview-destination-delivery.ts"
export type { PruneDestinationSyncRunsResult } from "./use-cases/prune-destination-sync-runs.ts"
export { pruneDestinationSyncRunsUseCase } from "./use-cases/prune-destination-sync-runs.ts"
export type {
  RecordDestinationSyncFailureInput,
  RecordDestinationSyncFailureResult,
} from "./use-cases/record-destination-sync-failure.ts"
export { recordDestinationSyncFailureUseCase } from "./use-cases/record-destination-sync-failure.ts"
export type {
  ResumeDestinationError,
  ResumeDestinationInput,
} from "./use-cases/resume-destination.ts"
export { resumeDestinationUseCase } from "./use-cases/resume-destination.ts"
export type {
  RunDestinationSyncError,
  RunDestinationSyncInput,
  RunDestinationSyncOutcome,
  RunDestinationSyncResult,
} from "./use-cases/run-destination-sync.ts"
export { runDestinationSyncUseCase } from "./use-cases/run-destination-sync.ts"
export type {
  SweepDestinationsPublish,
  SweepDestinationsResult,
} from "./use-cases/sweep-destinations.ts"
export { sweepDestinationsUseCase } from "./use-cases/sweep-destinations.ts"
export type {
  TestDestinationConnectionInput,
  TestDestinationConnectionResult,
} from "./use-cases/test-destination-connection.ts"
export { testDestinationConnectionUseCase } from "./use-cases/test-destination-connection.ts"
export type {
  UpdateDestinationError,
  UpdateDestinationInput,
} from "./use-cases/update-destination.ts"
export { updateDestinationUseCase } from "./use-cases/update-destination.ts"
