import { Effect } from "effect"
import { actionsLink, contextLine, header, projectOrOrgContext, sectionFields, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

const KIND_LABEL: Record<string, string> = {
  "issue.new": "New issue",
  "issue.regressed": "Issue regressed",
  "issue.escalating": "Issue escalating",
}

/**
 * One-shot incident events — `issue.new` and `issue.regressed` today.
 * No partner close notification ever lands. The payload doesn't carry
 * the issue's display name (lookup is deferred per the renderer
 * design); we instead lean on the project context line and the deep
 * link to disambiguate which issue.
 */
export const incidentEventRenderer: SlackNotificationRenderer<"incident.event"> = (payload, ctx) =>
  Effect.succeed({
    text: `${KIND_LABEL[payload.incidentKind] ?? "Incident"} in ${ctx.project?.name ?? ctx.organization.name}`,
    blocks: [
      header(`:rotating_light: ${KIND_LABEL[payload.incidentKind] ?? "Incident"}`),
      sectionMarkdown(payload.sampleExcerpt?.text ?? "An incident was detected in your project."),
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
