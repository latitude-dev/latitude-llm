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

export const incidentClosedRenderer: SlackNotificationRenderer<"incident.closed"> = (payload, ctx) => {
  const projectName = ctx.project?.name ?? ctx.organization.name
  const sev = severityEmoji(payload.severity)
  const issueUrl = ctx.project
    ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues/${payload.sourceId}`
    : ctx.webAppUrl

  return Effect.succeed({
    text: `Issue resolved in ${projectName} — elevated for ${humanizeDurationMs(payload.recovery.durationMs)}`,
    color: COLORS.resolved,
    blocks: [
      header(`Issue resolved · ${projectName}`),
      sectionMarkdown(`Elevated for *${humanizeDurationMs(payload.recovery.durationMs)}*.`),
      contextLine(
        `${sev} ${payload.severity} · ${payload.sourceType} · ${projectOrOrgContext(ctx.organization, ctx.project)}`,
      ),
      actionsLink("View issue", issueUrl),
    ],
  })
}

const humanizeDurationMs = (ms: number): string => {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`
}
