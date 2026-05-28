import type { FeatureFlagRepository } from "@domain/feature-flags"
import type { IssueRepository } from "@domain/issues"
import type { NOTIFICATION_KIND_META, NotificationKind, RenderNotificationEmailError } from "@domain/notifications"
import type { SqlClient } from "@domain/shared"
import type { WrappedReportRepository } from "@domain/spans"
import type { Effect } from "effect"
import type { z } from "zod"
import type { RenderedEmail } from "../types.ts"

/**
 * Shared context the worker passes to every per-kind notification email
 * template. `webAppUrl` is resolved from env once at worker boot.
 *
 * `project` is `null` when the notification has no project anchor
 * (`projectId` was null at create time) or when the project was deleted
 * between create and send. Templates that lean on the project name
 * should fall back to neutral wording in that case.
 */
export interface NotificationEmailRenderContext {
  readonly webAppUrl: string
  /**
   * Stable id of the notification row being rendered. Sustained-incident
   * renderers feed this through `buildChartUrl` so the embedded chart
   * `<Img>` points at the `apps/web` chart endpoint scoped to this row.
   */
  readonly notificationId: string
  /** When the row was created. Anchors "X ago" copy in the rendered email. */
  readonly notificationCreatedAt: Date
  readonly recipient: {
    readonly userId: string
    readonly name: string | null
    readonly email: string
  }
  readonly organization: {
    readonly id: string
    readonly name: string
  }
  readonly project: {
    readonly id: string
    readonly name: string
    readonly slug: string
  } | null
}

/**
 * Per-kind Effect service requirements for rendering. Each kind declares
 * what it needs server-side; the email worker's layer must provide the
 * union across all kinds. Adding a new kind that needs new repos = add
 * an entry here AND wire the matching `*Live` layer into the email
 * worker's `repoLayer`. TS will fail the build if the worker doesn't
 * cover the union at `Effect.provide(repoLayer)`.
 *
 * Kinds whose renderer needs nothing beyond the payload + `ctx` use
 * `never` and stay as trivial `Effect.tryPromise(() => template(...))`.
 */
export type RenderDepsByKind = {
  readonly "incident.event": IssueRepository | SqlClient
  readonly "incident.opened": IssueRepository | SqlClient
  readonly "incident.closed": IssueRepository | SqlClient
  readonly "wrapped.report": WrappedReportRepository | FeatureFlagRepository | SqlClient
  readonly "custom.message": never
}

export type RenderDepsFor<K extends NotificationKind> = RenderDepsByKind[K]

/**
 * Per-kind renderer signature. The renderer is an `Effect` so it can pull
 * whichever services it needs from the worker's layer — wrapped fetches
 * the report row, incident kinds live-resolve the issue's display name
 * since the payload only carries `sourceId`. Each renderer's `R` channel
 * is typed per kind via `RenderDepsFor<K>`; the worker provides the union
 * as one layer.
 */
export type NotificationEmailRenderer<K extends NotificationKind> = (
  payload: z.infer<(typeof NOTIFICATION_KIND_META)[K]["payload"]>,
  ctx: NotificationEmailRenderContext,
) => Effect.Effect<RenderedEmail, RenderNotificationEmailError, RenderDepsFor<K>>

export type NotificationEmailRendererRegistry = {
  readonly [K in NotificationKind]: NotificationEmailRenderer<K>
}
