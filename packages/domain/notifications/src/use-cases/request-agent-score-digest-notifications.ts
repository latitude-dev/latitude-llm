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

/**
 * The week's numbers, folded by the caller.
 *
 * Taken as input rather than computed here: `@domain/integrations` already depends on this package
 * for its Slack renderers, so a dependency on `@domain/agent-score` would close a cycle through
 * `flaggers → ai → cache-redis → integrations`. The worker owns the fold instead, and TypeScript
 * checks the two shapes line up at the call site.
 */
export type WeeklyAgentScoreDigestInput = Omit<AgentScoreWeeklyDigestPayload, "projectId" | "manualRequestId">

export interface RequestAgentScoreDigestNotificationsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly digest: WeeklyAgentScoreDigestInput
  /** Present only for a send staff triggered by hand; see the payload field of the same name. */
  readonly manualRequestId?: string | undefined
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
  | { readonly status: "skipped"; readonly reason: "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly AgentScoreDigestNotificationRequest[] }

export type RequestAgentScoreDigestNotificationsError = RepositoryError

/**
 * Producer step for `agent-score.weekly-digest`. No project-level gate: the organisation's feature
 * flag decides who takes part, and the recipient's own preferences decide who hears about it.
 */
export const requestAgentScoreDigestNotificationsUseCase = (input: RequestAgentScoreDigestNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const recipients = yield* resolveRecipients({
      organizationId: input.organizationId,
      projectId: undefined,
      kind: undefined,
    })
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload: AgentScoreWeeklyDigestPayload = {
      projectId: input.projectId,
      ...input.digest,
      ...(input.manualRequestId ? { manualRequestId: input.manualRequestId } : {}),
    }
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
    SqlClient | MembershipRepository
  >
