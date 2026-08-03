import type { MembershipRepository } from "@domain/organizations"
import {
  generateId,
  NotificationId,
  type OrganizationId,
  type RepositoryError,
  type SqlClient,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { BillingLimitReachedPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveAdminRecipients } from "../helpers/resolve-admin-recipients.ts"

export interface RequestBillingLimitNotificationsInput {
  readonly organizationId: OrganizationId
  readonly periodStart: string
  readonly periodEnd: string
  readonly limitKind: BillingLimitReachedPayload["limitKind"]
  readonly includedCredits: number
  readonly consumedCredits: number
  readonly overageCredits: number
}

export interface BillingLimitNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "billing.limit-reached"
  readonly idempotencyKey: string
  readonly payload: BillingLimitReachedPayload
  readonly notificationId: NotificationId
  readonly projectId: null
}

export type RequestBillingLimitNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly BillingLimitNotificationRequest[] }

export type RequestBillingLimitNotificationsError = RepositoryError

/**
 * Producer step for `billing.limit-reached`. Fans out to organization
 * owners and admins only — the audience that can upgrade or raise a spend
 * cap. Org-scoped (`projectId` null); once-per-period idempotency rides on
 * `periodStart` + `limitKind`.
 */
export const requestBillingLimitNotificationsUseCase = (input: RequestBillingLimitNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("limitKind", input.limitKind)

    const recipients = yield* resolveAdminRecipients({
      organizationId: input.organizationId,
    })
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload: BillingLimitReachedPayload = {
      organizationId: input.organizationId,
      limitKind: input.limitKind,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      includedCredits: input.includedCredits,
      consumedCredits: input.consumedCredits,
      overageCredits: input.overageCredits,
    }
    const idempotencyKey = buildIdempotencyKey({ kind: "billing.limit-reached", payload })

    const requests: BillingLimitNotificationRequest[] = recipients.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      kind: "billing.limit-reached" as const,
      idempotencyKey,
      payload,
      notificationId: NotificationId(generateId()),
      projectId: null,
    }))

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestBillingLimitNotifications")) as Effect.Effect<
    RequestBillingLimitNotificationsResult,
    RequestBillingLimitNotificationsError,
    SqlClient | MembershipRepository
  >
