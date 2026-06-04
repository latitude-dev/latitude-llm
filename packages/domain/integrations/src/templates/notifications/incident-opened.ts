import { Effect } from "effect"
import {
  actionsLink,
  contextLine,
  monitorAttributionBlocks,
  monitorDeepLink,
  projectOrOrgContext,
  sectionMarkdown,
  severityColor,
  trendChartBlock,
} from "./blocks.ts"
import { resolveSourceName } from "./source-name.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const incidentOpenedRenderer: SlackNotificationRenderer<"incident.opened"> = (payload, ctx) =>
  Effect.gen(function* () {
    const projectName = ctx.project?.name ?? ctx.organization.name
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
        text: `Escalating: ${searchRef} in ${projectName}`,
        color: severityColor(payload.severity),
        blocks: [
          sectionMarkdown(`A saved search started escalating: *${searchRef}*.`),
          ...attribution,
          context,
          actionsLink("View monitor", monitorUrl),
        ],
      }
    }

    const breachLine = payload.breach
      ? `Rate climbed to *${formatRate(payload.breach.triggerRate)}/hr* — ${formatMultiple(payload.breach.triggerRate, payload.breach.baselineRate)} the baseline of ${formatRate(payload.breach.baselineRate)}/hr`
      : null

    const tags = payload.tags ?? []
    const chart = trendChartBlock(ctx.notificationId, ctx.webAppUrl)

    return {
      text: `Issue escalating in ${projectName}${sourceName ? `: ${sourceName}` : ""}`,
      color: severityColor(payload.severity),
      blocks: [
        ...(sourceName ? [sectionMarkdown(`*<${issueUrl}|${sourceName}>*`)] : []),
        ...(breachLine ? [sectionMarkdown(breachLine)] : []),
        ...(payload.sampleExcerpt?.text ? [sectionMarkdown(`\`\`\`\n${payload.sampleExcerpt.text}\n\`\`\``)] : []),
        ...(chart ? [chart] : []),
        ...(tags.length > 0 ? [sectionMarkdown(tags.map((t) => `\`${t}\``).join("  "))] : []),
        ...attribution,
        context,
        actionsLink("View issue", issueUrl),
      ],
    }
  })

const formatRate = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(1))
const formatMultiple = (trigger: number, baseline: number): string =>
  baseline === 0 ? "" : `${(trigger / baseline).toFixed(1)}×`
