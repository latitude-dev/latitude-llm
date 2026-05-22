import { Effect } from "effect"
import { actionsLink, contextLine, header, projectOrOrgContext, sectionFields, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/**
 * Sustained-incident open notification (`issue.escalating`). Includes a
 * one-line breach summary if the producer snapshotted it; otherwise
 * falls back to a generic "rate climbed past the threshold" copy line.
 */
export const incidentOpenedRenderer: SlackNotificationRenderer<"incident.opened"> = (payload, ctx) => {
  const summary = payload.breach
    ? `Rate climbed to *${formatRate(payload.breach.triggerRate)}*/hr — past a baseline of ${formatRate(
        payload.breach.baselineRate,
      )}/hr.`
    : "An escalating incident is currently open."

  return Effect.succeed({
    text: `Incident opened in ${ctx.project?.name ?? ctx.organization.name}`,
    blocks: [
      header(":warning: Incident opened"),
      sectionMarkdown(summary),
      ...(payload.sampleExcerpt?.text ? [sectionMarkdown(`> ${payload.sampleExcerpt.text}`)] : []),
      sectionFields([
        { label: "Severity", value: payload.severity },
        { label: "Source", value: payload.sourceType },
      ]),
      contextLine(projectOrOrgContext(ctx.organization, ctx.project)),
      ...(ctx.project
        ? [actionsLink("Open in Latitude", `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues/${payload.sourceId}`)]
        : []),
    ],
  })
}

const formatRate = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(1))
