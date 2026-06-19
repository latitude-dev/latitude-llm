import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { DestinationQuarantinedEmail } from "./EmailTemplate.tsx"

const scopeOf = (ctx: NotificationEmailRenderContext): string =>
  ctx.project ? `${ctx.organization.name} / ${ctx.project.name}` : ctx.organization.name

/**
 * Renderer for `destination.quarantined`. Payload-only (no repo lookups):
 * the destination name + kind are snapshotted on the payload, and the
 * project scope comes from `ctx`. Falls back to org-only scope when the
 * project was deleted between request and send.
 */
export const destinationQuarantinedRenderer: NotificationEmailRenderer<"destination.quarantined"> = (payload, ctx) =>
  Effect.tryPromise({
    try: async () => {
      const scope = scopeOf(ctx)
      const settingsUrl = ctx.project
        ? `${ctx.webAppUrl.replace(/\/$/, "")}/projects/${ctx.project.slug}/settings/data-destinations/${payload.destinationId}`
        : undefined
      const html = await renderEmail(
        <DestinationQuarantinedEmail
          destinationName={payload.destinationName}
          scope={scope}
          failureMessage={payload.failureMessage ?? undefined}
          settingsUrl={settingsUrl}
          webAppUrl={ctx.webAppUrl}
        />,
      )
      return {
        html,
        subject: `Data destination "${payload.destinationName}" stopped syncing`,
        text: `${payload.destinationName} in ${scope} was quarantined after repeated failures and is no longer exporting data.${
          payload.failureMessage ? `\n\nLast error: ${payload.failureMessage}` : ""
        }${settingsUrl ? `\n\nReconnect it: ${settingsUrl}` : ""}`,
      }
    },
    catch: (cause) => ({
      _tag: "RenderNotificationEmailError" as const,
      message: "Failed to render destination.quarantined email",
      cause,
    }),
  })

export default DestinationQuarantinedEmail
