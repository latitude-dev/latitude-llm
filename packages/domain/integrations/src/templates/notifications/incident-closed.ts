import { Effect } from "effect"
import {
  actionsLink,
  COLORS,
  contextLine,
  monitorAttributionBlocks,
  monitorDeepLink,
  projectOrOrgContext,
  sectionMarkdown,
  trendChartBlock,
} from "./blocks.ts"
import { resolveSourceName } from "./source-name.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const incidentClosedRenderer: SlackNotificationRenderer<"incident.closed"> = (payload, ctx) =>
  Effect.gen(function* () {
    const projectName = ctx.project?.name ?? ctx.organization.name
    const isSavedSearch = payload.sourceType === "savedSearch"
    const issueUrl = ctx.project
      ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${payload.sourceId}`
      : ctx.webAppUrl
    const monitorUrl =
      monitorDeepLink({ webAppUrl: ctx.webAppUrl, projectSlug: ctx.project?.slug, monitorSlug: payload.monitorSlug }) ??
      ctx.webAppUrl
    const duration = humanizeDurationMs(payload.recovery.durationMs)

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
        text: `Resolved: escalation on ${searchRef} — elevated for ${duration}`,
        color: COLORS.resolved,
        blocks: [
          sectionMarkdown(`Escalation resolved on *${searchRef}* — elevated for *${duration}*.`),
          ...attribution,
          context,
          actionsLink("View monitor", monitorUrl),
        ],
      }
    }

    const chart = trendChartBlock(ctx.notificationId, ctx.webAppUrl)

    return {
      text: `Issue recovered in ${projectName} — elevated for ${duration}`,
      color: COLORS.resolved,
      blocks: [
        ...(sourceName ? [sectionMarkdown(`*<${issueUrl}|${sourceName}>*`)] : []),
        sectionMarkdown(`Elevated for *${duration}*.`),
        ...(chart ? [chart] : []),
        ...attribution,
        context,
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
