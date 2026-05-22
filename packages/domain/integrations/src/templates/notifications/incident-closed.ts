import { Effect } from "effect"
import { actionsLink, contextLine, header, projectOrOrgContext, sectionFields, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/**
 * Sustained-incident close notification — partner to `incident.opened`.
 * `recovery.durationMs` drives the "elevated for X" copy.
 */
export const incidentClosedRenderer: SlackNotificationRenderer<"incident.closed"> = (payload, ctx) =>
  Effect.succeed({
    text: `Incident closed in ${ctx.project?.name ?? ctx.organization.name}`,
    blocks: [
      header(":white_check_mark: Incident closed"),
      sectionMarkdown(`Elevated for *${humanizeDurationMs(payload.recovery.durationMs)}*.`),
      sectionFields([
        { label: "Severity", value: payload.severity },
        { label: "Source", value: payload.sourceType },
      ]),
      contextLine(projectOrOrgContext(ctx.organization, ctx.project)),
      ...(ctx.project
        ? [actionsLink("View incident", `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues/${payload.sourceId}`)]
        : []),
    ],
  })

const humanizeDurationMs = (ms: number): string => {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`
}
