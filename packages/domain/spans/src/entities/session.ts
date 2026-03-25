import type { ExternalUserId, OrganizationId, ProjectId, SessionId } from "@domain/shared"

/**
 * Session — aggregated from spans that share a session_id.
 *
 * A session groups one or more traces representing multi-turn
 * interactions between a user and the system. Populated by a
 * ClickHouse materialized view on each insert into spans.
 */
export interface Session {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId

  readonly traceCount: number
  readonly traceIds: readonly string[]
  readonly spanCount: number
  readonly errorCount: number

  readonly startTime: Date
  readonly endTime: Date
  readonly durationNs: number

  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  readonly tokensTotal: number

  readonly costInputMicrocents: number
  readonly costOutputMicrocents: number
  readonly costTotalMicrocents: number

  readonly userId: ExternalUserId
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly models: readonly string[]
  readonly providers: readonly string[]
  readonly serviceNames: readonly string[]
}
