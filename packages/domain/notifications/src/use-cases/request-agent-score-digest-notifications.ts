import { type AgentScoreSnapshotRepository, runWeeklyAgentScoreDigest } from "@domain/agent-score"
import type { MembershipRepository } from "@domain/organizations"
import {
  generateId,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type SqlClient,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { AgentScoreWeeklyDigestPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"

export interface RequestAgentScoreDigestNotificationsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** Inclusive UTC date bounds, `YYYY-MM-DD`, frozen by the cron that started the run. */
  readonly windowStart: string
  readonly windowEnd: string
}

export interface AgentScoreDigestNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "agent-score.weekly-digest"
  readonly idempotencyKey: string
  readonly payload: AgentScoreWeeklyDigestPayload
  readonly notificationId: NotificationId
  readonly projectId: ProjectId
}

export type RequestAgentScoreDigestNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "no-score" | "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly AgentScoreDigestNotificationRequest[] }

export type RequestAgentScoreDigestNotificationsError = RepositoryError

/**
 * Producer step for `agent-score.weekly-digest`.
 *
 * Folds the window's snapshots here rather than carrying the numbers on the task: the snapshots are
 * immutable, so the fold is deterministic whenever it runs, and the payload schema stays the one
 * place that describes a digest. The fan-out's eligibility read only proves the window holds a
 * score; a project can still fall out here if it was the sample or showcase filter that was racing,
 * so the `no-score` branch is real rather than defensive.
 *
 * No project-level gate. The organisation's feature flag decides who takes part and the recipient's
 * own preferences decide who hears about it.
 */
export const requestAgentScoreDigestNotificationsUseCase = (input: RequestAgentScoreDigestNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const digested = yield* runWeeklyAgentScoreDigest({
      organizationId: input.organizationId,
      projectId: input.projectId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    })
    if (digested.status === "skipped") {
      return { status: "skipped", reason: "no-score" } as const
    }

    const recipients = yield* resolveRecipients({
      organizationId: input.organizationId,
      projectId: undefined,
      kind: undefined,
    })
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload: AgentScoreWeeklyDigestPayload = { projectId: input.projectId, ...digested.digest }
    const idempotencyKey = buildIdempotencyKey({ kind: "agent-score.weekly-digest", payload })

    const requests: AgentScoreDigestNotificationRequest[] = recipients.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      kind: "agent-score.weekly-digest" as const,
      idempotencyKey,
      payload,
      notificationId: NotificationId(generateId()),
      projectId: input.projectId,
    }))

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestAgentScoreDigestNotifications")) as Effect.Effect<
    RequestAgentScoreDigestNotificationsResult,
    RequestAgentScoreDigestNotificationsError,
    SqlClient | MembershipRepository | AgentScoreSnapshotRepository
  >
