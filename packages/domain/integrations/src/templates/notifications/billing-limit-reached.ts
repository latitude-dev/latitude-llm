import { Effect } from "effect"
import { actionsLink, COLORS, contextLine, header, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/**
 * `billing.limit-reached` Slack renderer. The `billing` group is
 * slack-routable so org routes can surface credit/spend-cap alerts.
 */
export const billingLimitReachedRenderer: SlackNotificationRenderer<"billing.limit-reached"> = (payload, ctx) => {
  const billingUrl = `${ctx.webAppUrl.replace(/\/$/, "")}/settings/billing`
  const included = payload.includedCredits.toLocaleString("en-US")
  const isSpendCap = payload.limitKind === "spend-cap"
  const title = isSpendCap ? "Monthly spend limit reached" : "Plan credit limit reached"
  const body = isSpendCap
    ? `*${ctx.organization.name}* has reached its configured monthly spend limit for this billing period.`
    : `*${ctx.organization.name}* has used all *${included}* included credits for this billing period.`

  return Effect.succeed({
    text: title,
    color: COLORS.critical,
    blocks: [
      header(`:warning: ${title}`),
      sectionMarkdown(body),
      contextLine(`Consumed ${payload.consumedCredits.toLocaleString("en-US")} credits · owners and admins notified.`),
      actionsLink("Open billing settings", billingUrl),
    ],
  })
}
