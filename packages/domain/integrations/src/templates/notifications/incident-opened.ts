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

export const incidentOpenedRenderer: SlackNotificationRenderer<"incident.opened"> = (payload, ctx) => {
  const projectName = ctx.project?.name ?? ctx.organization.name
  const sev = severityEmoji(payload.severity)
  const issueUrl = ctx.project
    ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues/${payload.sourceId}`
    : ctx.webAppUrl

  const breachLine = payload.breach
    ? `Rate climbed to *${formatRate(payload.breach.triggerRate)}/hr* — ${formatMultiple(payload.breach.triggerRate, payload.breach.baselineRate)} the baseline of ${formatRate(payload.breach.baselineRate)}/hr`
    : null

  return Effect.succeed({
    text: `Issue escalating in ${projectName}`,
    color: COLORS.escalating,
    blocks: [
      header(`Issue escalating · ${projectName}`),
      ...(breachLine ? [sectionMarkdown(breachLine)] : []),
      ...(payload.sampleExcerpt?.text ? [sectionMarkdown(`> ${payload.sampleExcerpt.text}`)] : []),
      contextLine(`${sev} ${payload.severity} · ${payload.sourceType} · ${projectOrOrgContext(ctx.organization, ctx.project)}`),
      actionsLink("View issue", issueUrl),
    ],
  })
}

const formatRate = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(1))

const formatMultiple = (trigger: number, baseline: number): string => {
  if (baseline === 0) return ""
  const ratio = trigger / baseline
  return `${ratio.toFixed(1)}×`
}
