import type { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { TraceRepository } from "../ports/trace-repository.ts"

export interface GetTraceConversationChunkInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly offset: number
  readonly limit: number
}

export const getTraceConversationChunkUseCase = (input: GetTraceConversationChunkInput) =>
  Effect.gen(function* () {
    const repo = yield* TraceRepository
    return yield* repo.findConversationChunk(input)
  })
