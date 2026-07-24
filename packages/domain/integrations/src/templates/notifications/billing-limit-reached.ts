import { Effect } from "effect"
import { actionsLink, COLORS, contextLine, header, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/** `billing.limit-reached` Slack renderer (billing group is not slack-routable). */
export const billingLimitReachedRenderer: SlackNotificationRenderer<"billing.limit-reached"> = (payload, ctx) => {
  const billingUrl = `${ctx.webAppUrl.replace(/\/$/, "")}/settings/billing`
  const included = payload.includedCredits.toLocaleString("en-US")
  const { title, body } =
    payload.limitKind === "spend-cap"
      ? {
          title: "Monthly spend limit reached",
          body: `*${ctx.organization.name}* has reached its configured monthly spend limit for this billing period.`,
        }
      : payload.limitKind === "overage-started"
        ? {
            title: "Overage billing started",
            body: `*${ctx.organization.name}* has used all *${included}* included credits and is now in overage for this billing period.`,
          }
        : {
            title: "Plan credit limit reached",
            body: `*${ctx.organization.name}* has used all *${included}* included credits for this billing period.`,
          }

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
