import { Effect } from "effect"
import { actionsLink, COLORS, contextLine, header, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const wrappedReportRenderer: SlackNotificationRenderer<"wrapped.report"> = (payload, ctx) => {
  const projectName = ctx.project?.name ?? ctx.organization.name

  return Effect.succeed({
    text: `Your weekly Wrapped for ${projectName} is ready`,
    color: COLORS.wrapped,
    blocks: [
      header(`Weekly Wrapped · ${projectName}`),
      sectionMarkdown(`Your weekly report is ready.`),
      contextLine(`${ctx.organization.name}`),
      actionsLink("Open report", payload.link),
    ],
  })
}
