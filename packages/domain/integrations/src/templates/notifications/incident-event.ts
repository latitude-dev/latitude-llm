import { ALERT_INCIDENT_KIND_LABEL } from "@domain/shared"
import { Effect } from "effect"
import {
  actionsLink,
  contextLine,
  monitorAttributionBlocks,
  monitorDeepLink,
  projectOrOrgContext,
  sectionMarkdown,
  severityColor,
} from "./blocks.ts"
import { resolveSourceName } from "./source-name.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const incidentEventRenderer: SlackNotificationRenderer<"incident.event"> = (payload, ctx) =>
  Effect.gen(function* () {
    const name = ALERT_INCIDENT_KIND_LABEL[payload.incidentKind] ?? "Incident"
    const color = severityColor(payload.severity)
    const isSavedSearch = payload.sourceType === "savedSearch"
    const issueUrl = ctx.project
      ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${payload.sourceId}`
      : ctx.webAppUrl
    const monitorUrl =
      monitorDeepLink({ webAppUrl: ctx.webAppUrl, projectSlug: ctx.project?.slug, monitorSlug: payload.monitorSlug }) ??
      ctx.webAppUrl

    const sourceName = yield* resolveSourceName(payload)

    const attribution = monitorAttributionBlocks({
      webAppUrl: ctx.webAppUrl,
      projectSlug: ctx.project?.slug,
      monitorName: payload.monitorName,
      monitorSlug: payload.monitorSlug,
      incidentKind: payload.incidentKind,
      condition: payload.condition,
    })
    const context = contextLine(
      `${payload.severity} · ${payload.sourceType} · ${projectOrOrgContext(ctx.organization, ctx.project)}`,
    )

    if (isSavedSearch) {
      const searchRef = sourceName ?? "a saved search"
      return {
        text: `${name} in ${ctx.project?.name ?? ctx.organization.name}: ${searchRef}`,
        color,
        blocks: [
          sectionMarkdown(`A saved search fired an alert: *${searchRef}*.`),
          ...attribution,
          context,
          actionsLink("View monitor", monitorUrl),
        ],
      }
    }

    const tags = payload.tags ?? []
    return {
      text: `${name} in ${ctx.project?.name ?? ctx.organization.name}${sourceName ? `: ${sourceName}` : ""}`,
      color,
      blocks: [
        ...(sourceName ? [sectionMarkdown(`*<${issueUrl}|${sourceName}>*`)] : []),
        sectionMarkdown(sourceName ? `A new <${issueUrl}|issue> has been detected.` : `A new issue has been detected.`),
        ...(payload.sampleExcerpt?.text ? [sectionMarkdown(`\`\`\`\n${payload.sampleExcerpt.text}\n\`\`\``)] : []),
        ...(tags.length > 0 ? [sectionMarkdown(tags.map((t) => `\`${t}\``).join("  "))] : []),
        ...attribution,
        context,
        actionsLink("View issue", issueUrl),
      ],
    }
  })
