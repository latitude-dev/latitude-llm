import type { NOTIFICATION_KIND_META, NotificationKind } from "@domain/notifications"
import type { z } from "zod"
import type { RenderedEmail } from "../types.ts"

/**
 * Shared context the worker passes to every per-kind notification email
 * template. `webAppUrl` is resolved from env once at worker boot.
 */
export interface NotificationEmailRenderContext {
  readonly webAppUrl: string
  readonly recipient: {
    readonly userId: string
    readonly name: string | null
    readonly email: string
  }
}

/** Per-kind renderer signature, narrowed via the kind metadata payload. */
export type NotificationEmailRenderer<K extends NotificationKind> = (
  payload: z.infer<(typeof NOTIFICATION_KIND_META)[K]["payload"]>,
  ctx: NotificationEmailRenderContext,
) => Promise<RenderedEmail>

export type NotificationEmailRendererRegistry = {
  readonly [K in NotificationKind]: NotificationEmailRenderer<K>
}
