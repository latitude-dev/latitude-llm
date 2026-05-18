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
  readonly recipient: {
    readonly userId: string
    readonly name: string | null
    readonly email: string
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
  readonly "incident.opened": never
  readonly "incident.closed": never
  readonly "wrapped.report": WrappedReportRepository | SqlClient
  readonly "custom.message": never
}

export type RenderDepsFor<K extends NotificationKind> = RenderDepsByKind[K]

/**
 * Per-kind renderer signature. The renderer is an `Effect` so it can pull
 * whichever services it needs from the worker's layer — wrapped fetches
 * the report row, others snapshot everything into the payload and use no
 * services. Each renderer's `R` channel is typed per kind via
 * `RenderDepsFor<K>`; the worker provides the union as one layer.
 */
export type NotificationEmailRenderer<K extends NotificationKind> = (
  payload: z.infer<(typeof NOTIFICATION_KIND_META)[K]["payload"]>,
  ctx: NotificationEmailRenderContext,
) => Effect.Effect<RenderedEmail, RenderNotificationEmailError, RenderDepsFor<K>>

export type NotificationEmailRendererRegistry = {
  readonly [K in NotificationKind]: NotificationEmailRenderer<K>
}
