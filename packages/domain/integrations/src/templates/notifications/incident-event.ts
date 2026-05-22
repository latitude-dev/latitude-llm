import { Effect } from "effect"
import {
  actionsLink,
  COLORS,
  contextLine,
  header,
  projectOrOrgContext,
  sectionMarkdown,
  severityEmoji,
} from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

const KIND_NAME: Record<string, string> = {
  "issue.new": "New issue",
  "issue.regressed": "Issue regressed",
  "issue.escalating": "Issue escalating",
}

const KIND_COLOR: Record<string, string> = {
  "issue.new": COLORS.newIssue,
  "issue.regressed": COLORS.regressed,
  "issue.escalating": COLORS.escalating,
}

export const incidentEventRenderer: SlackNotificationRenderer<"incident.event"> = (payload, ctx) => {
  const name = KIND_NAME[payload.incidentKind] ?? "Incident"
  const color = KIND_COLOR[payload.incidentKind] ?? COLORS.newIssue
  const projectName = ctx.project?.name ?? ctx.organization.name
  const sev = severityEmoji(payload.severity)
  const issueUrl = ctx.project
    ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues/${payload.sourceId}`
    : ctx.webAppUrl

  return Effect.succeed({
    text: `${name} in ${projectName}`,
    color,
    blocks: [
      header(`${name} · ${projectName}`),
      ...(payload.sampleExcerpt?.text ? [sectionMarkdown(`> ${payload.sampleExcerpt.text}`)] : []),
      contextLine(
        `${sev} ${payload.severity} · ${payload.sourceType} · ${projectOrOrgContext(ctx.organization, ctx.project)}`,
      ),
      actionsLink("View issue", issueUrl),
    ],
  })
}
