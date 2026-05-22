import { Effect } from "effect"
import { actionsLink, contextLine, header, projectOrOrgContext, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/**
 * Weekly Wrapped report. Payload carries the absolute URL; we don't
 * resolve the report row in the Slack renderer (no SqlClient in `R`).
 */
export const wrappedReportRenderer: SlackNotificationRenderer<"wrapped.report"> = (payload, ctx) =>
  Effect.succeed({
    text: `Your weekly Wrapped is ready${ctx.project ? ` for ${ctx.project.name}` : ""}`,
    blocks: [
      header(":sparkles: Your weekly Wrapped"),
      sectionMarkdown("A fresh report covering the past week is ready to read."),
      contextLine(projectOrOrgContext(ctx.organization, ctx.project)),
      actionsLink("Open report", payload.link),
    ],
  })
