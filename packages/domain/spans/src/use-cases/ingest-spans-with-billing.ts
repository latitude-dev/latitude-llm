import {
  checkTraceIngestionBillingUseCase,
  type NoCreditsRemainingError,
  type UnknownStripePlanError,
} from "@domain/billing"
import type { QueuePublishError, QueuePublisher } from "@domain/queue"
import type { RepositoryError, SettingsReader, SqlClient, StorageDisk, StorageError } from "@domain/shared"
import { Effect } from "effect"
import { type IngestSpansInput, ingestSpansUseCase } from "./ingest-spans.ts"

export const ingestSpansWithBillingUseCase = Effect.fn("spans.ingestSpansWithBilling")(function* (
  input: IngestSpansInput,
) {
  yield* checkTraceIngestionBillingUseCase(input.organizationId)
  yield* ingestSpansUseCase(input)
}) as (
  input: IngestSpansInput,
) => Effect.Effect<
  void,
  NoCreditsRemainingError | QueuePublishError | RepositoryError | StorageError | UnknownStripePlanError,
  QueuePublisher | StorageDisk | SettingsReader | SqlClient
>
