import type { OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { SpanRepository } from "../ports/span-repository.ts"

export interface GetSpanConversationChunkInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly spanId: SpanId
  readonly offset: number
  readonly limit: number
}

export const getSpanConversationChunkUseCase = (input: GetSpanConversationChunkInput) =>
  Effect.gen(function* () {
    const repo = yield* SpanRepository
    return yield* repo.findSpanConversationChunk(input)
  })
