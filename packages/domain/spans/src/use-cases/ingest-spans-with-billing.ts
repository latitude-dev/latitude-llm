import {
  checkTraceIngestionBillingUseCase,
  type NoCreditsRemainingError,
  type UnknownStripePlanError,
} from "@domain/billing"
import type { ProjectRepository } from "@domain/projects"
import type { QueuePublishError, QueuePublisher } from "@domain/queue"
import type { RepositoryError, SettingsReader, SqlClient, StorageDisk, StorageError } from "@domain/shared"
import { Effect } from "effect"
import type { SpanDecodingError } from "../errors.ts"
import { type IngestSpansInput, type IngestSpansResult, ingestSpansUseCase } from "./ingest-spans.ts"

export const ingestSpansWithBillingUseCase = Effect.fn("spans.ingestSpansWithBilling")(function* (
  input: IngestSpansInput,
) {
  yield* checkTraceIngestionBillingUseCase(input.organizationId)
  return yield* ingestSpansUseCase(input)
}) as (
  input: IngestSpansInput,
) => Effect.Effect<
  IngestSpansResult,
  | NoCreditsRemainingError
  | QueuePublishError
  | RepositoryError
  | SpanDecodingError
  | StorageError
  | UnknownStripePlanError,
  ProjectRepository | QueuePublisher | StorageDisk | SettingsReader | SqlClient
>
