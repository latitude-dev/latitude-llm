import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderer } from "../types.ts"
import { BillingLimitReachedEmail } from "./EmailTemplate.tsx"

const formatCredits = (n: number): string => n.toLocaleString("en-US")

/**
 * Renderer for `billing.limit-reached`. Payload-only: credit snapshots ride
 * on the payload, and billing settings live at the org-level `/settings/billing`
 * route (no project context).
 */
export const billingLimitReachedRenderer: NotificationEmailRenderer<"billing.limit-reached"> = (payload, ctx) =>
  Effect.tryPromise({
    try: async () => {
      const orgName = ctx.organization.name
      const billingUrl = `${ctx.webAppUrl.replace(/\/$/, "")}/settings/billing`
      const included = formatCredits(payload.includedCredits)

      const { title, body } =
        payload.limitKind === "spend-cap"
          ? {
              title: "Your monthly spend limit has been reached",
              body: `${orgName} has reached its configured monthly spend limit for this billing period. Raise the limit or wait for the period to reset to continue billable AI work and overage usage.`,
            }
          : payload.limitKind === "overage-started"
            ? {
                title: "Your plan has entered overage billing",
                body: `${orgName} has used all ${included} credits included in its plan for this billing period. Additional usage is now billed as overage. Review usage or set a spend limit in billing settings.`,
              }
            : {
                title: "Your plan credit limit has been reached",
                body: `${orgName} has used all ${included} credits included in its plan for this billing period. Upgrade your plan or wait for the period to reset to continue ingesting traces and running AI features.`,
              }

      const html = await renderEmail(
        <BillingLimitReachedEmail
          organizationName={orgName}
          title={title}
          body={body}
          billingUrl={billingUrl}
          webAppUrl={ctx.webAppUrl}
        />,
      )

      return {
        html,
        subject: title,
        text: `${body}\n\nOpen billing settings: ${billingUrl}`,
      }
    },
    catch: (cause) => ({
      _tag: "RenderNotificationEmailError" as const,
      message: "Failed to render billing.limit-reached email",
      cause,
    }),
  })

export default BillingLimitReachedEmail
