import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
import { actionsLink, COLORS, contextLine, projectOrOrgContext, sectionMarkdown, trendChartBlock } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const incidentClosedRenderer: SlackNotificationRenderer<"incident.closed"> = (payload, ctx) =>
  Effect.gen(function* () {
    const projectName = ctx.project?.name ?? ctx.organization.name
    const issueUrl = ctx.project
      ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${payload.sourceId}`
      : ctx.webAppUrl
    const duration = humanizeDurationMs(payload.recovery.durationMs)

    const issues = yield* IssueRepository
    const issueName = yield* issues.findById(IssueId(payload.sourceId)).pipe(
      Effect.map((i) => i.name),
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )

    const chart = trendChartBlock(ctx.notificationId, ctx.webAppUrl)

    return {
      text: `Issue recovered in ${projectName} — elevated for ${duration}`,
      color: COLORS.resolved,
      blocks: [
        ...(issueName ? [sectionMarkdown(`*<${issueUrl}|${issueName}>*`)] : []),
        sectionMarkdown(`Elevated for *${duration}*.`),
        ...(chart ? [chart] : []),
        contextLine(
          `${payload.severity} · ${payload.sourceType} · ${projectOrOrgContext(ctx.organization, ctx.project)}`,
        ),
        actionsLink("View issue", issueUrl),
      ],
    }
  })

const humanizeDurationMs = (ms: number): string => {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`
}
