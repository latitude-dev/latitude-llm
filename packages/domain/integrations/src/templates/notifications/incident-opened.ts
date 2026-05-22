import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
import {
  actionsLink,
  contextLine,
  projectOrOrgContext,
  sectionMarkdown,
  severityColor,
  trendChartBlock,
} from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const incidentOpenedRenderer: SlackNotificationRenderer<"incident.opened"> = (payload, ctx) =>
  Effect.gen(function* () {
    const projectName = ctx.project?.name ?? ctx.organization.name
    const issueUrl = ctx.project
      ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${payload.sourceId}`
      : ctx.webAppUrl

    const issues = yield* IssueRepository
    const issueName = yield* issues.findById(IssueId(payload.sourceId)).pipe(
      Effect.map((i) => i.name),
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )

    const breachLine = payload.breach
      ? `Rate climbed to *${formatRate(payload.breach.triggerRate)}/hr* — ${formatMultiple(payload.breach.triggerRate, payload.breach.baselineRate)} the baseline of ${formatRate(payload.breach.baselineRate)}/hr`
      : null

    const tags = payload.tags ?? []
    const chart = trendChartBlock(ctx.notificationId, ctx.webAppUrl)

    return {
      text: `Issue escalating in ${projectName}${issueName ? `: ${issueName}` : ""}`,
      color: severityColor(payload.severity),
      blocks: [
        ...(issueName ? [sectionMarkdown(`*<${issueUrl}|${issueName}>*`)] : []),
        ...(breachLine ? [sectionMarkdown(breachLine)] : []),
        ...(payload.sampleExcerpt?.text ? [sectionMarkdown(`\`\`\`\n${payload.sampleExcerpt.text}\n\`\`\``)] : []),
        ...(chart ? [chart] : []),
        ...(tags.length > 0 ? [sectionMarkdown(tags.map((t) => `\`${t}\``).join("  "))] : []),
        contextLine(
          `${payload.severity} · ${payload.sourceType} · ${projectOrOrgContext(ctx.organization, ctx.project)}`,
        ),
        actionsLink("View issue", issueUrl),
      ],
    }
  })

const formatRate = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(1))
const formatMultiple = (trigger: number, baseline: number): string =>
  baseline === 0 ? "" : `${(trigger / baseline).toFixed(1)}×`
