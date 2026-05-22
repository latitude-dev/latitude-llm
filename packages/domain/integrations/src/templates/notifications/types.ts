import type { NOTIFICATION_KIND_META, NotificationKind } from "@domain/notifications"
import type { NotificationId, OrganizationId, ProjectId } from "@domain/shared"
import type { KnownBlock } from "@slack/web-api"
import { Data, type Effect } from "effect"
import type { z } from "zod"

/**
 * Shared context the worker passes to every per-kind Slack renderer.
 * Resolved once per dispatch, never per recipient (Slack delivery is
 * channel-scoped, not user-scoped). `webAppUrl` is read from env at
 * worker boot.
 *
 * `project` is `null` when the notification has no project anchor
 * (`projectId` null at create time — `custom.message`) or when the
 * project was deleted between create and send. Renderers that lean on
 * the project name should fall back to neutral wording in that case.
 */
export interface SlackRenderContext {
  readonly webAppUrl: string
  readonly organization: {
    readonly id: OrganizationId
    readonly name: string
  }
  readonly project: {
    readonly id: ProjectId
    readonly name: string
    readonly slug: string
  } | null
  /**
   * Set when the dispatch is anchored to a specific in-app notification
   * row (typical incident / wrapped flows). `null` for kinds that don't
   * write an in-app row before fanning out to Slack — none today, but
   * the field stays optional so future kinds can stay out of the bell
   * feed if they want to.
   */
  readonly notificationId: NotificationId | null
}

/**
 * What every renderer returns. `text` is the Slack "summary" string —
 * shown in mobile push, screen readers, and as the message preview in
 * thread/inbox views. `blocks` is the rich content; layout uses
 * `KnownBlock` directly from `@slack/web-api`.
 *
 * `color` is an optional hex color string that wraps `blocks` in a
 * Slack `attachment` to produce a left-side colored bar — the fastest
 * visual signal for severity / kind. When absent, `blocks` are posted
 * at the top level (no bar).
 */
export interface RenderedSlackMessage {
  readonly text: string
  readonly blocks: readonly KnownBlock[]
  readonly color?: string
}

/**
 * Renderer failure. Distinguished from transport errors so the worker
 * can ack the job (re-rendering won't help with a corrupt payload). The
 * payload still goes to the structured log for triage.
 */
export class RenderSlackError extends Data.TaggedError("RenderSlackError")<{
  readonly kind: NotificationKind
  readonly reason: "invalid-payload" | "internal"
  readonly cause?: unknown
}> {
  override get message() {
    return `Slack render failed for kind=${this.kind} (${this.reason})`
  }
}

/**
 * Per-kind renderer signature. `R = never` for every kind today —
 * payloads from the producer carry enough to render without extra repo
 * lookups, and Slack's "compact" message format favors short summary
 * cards over the richer email layout that does lookup issue display
 * names etc.
 */
export type SlackNotificationRenderer<K extends NotificationKind> = (
  payload: z.infer<(typeof NOTIFICATION_KIND_META)[K]["payload"]>,
  ctx: SlackRenderContext,
) => Effect.Effect<RenderedSlackMessage, RenderSlackError, never>

export type SlackNotificationRendererRegistry = {
  readonly [K in NotificationKind]: SlackNotificationRenderer<K>
}
