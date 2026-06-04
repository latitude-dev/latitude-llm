import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { buildChartUrl } from "../../../helpers/chart-url.ts"
import { renderEmail } from "../../../utils/render.ts"
import { buildMonitorAttribution } from "../-incident-components.tsx"
import { resolveIncidentSource } from "../-incident-source.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { IncidentOpenedEmail } from "./EmailTemplate.tsx"

const buildIssueUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.opened">>[0],
): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${encodeURIComponent(payload.sourceId)}`
}

export const incidentOpenedRenderer: NotificationEmailRenderer<"incident.opened"> = (payload, ctx) =>
  Effect.gen(function* () {
    const isSavedSearch = payload.sourceType === "savedSearch"
    const source = yield* resolveIncidentSource(payload)
    const sourceName = source.name ?? (isSavedSearch ? "a saved search" : "an issue")
    const issueUrl = isSavedSearch ? undefined : buildIssueUrl(ctx, payload)

    const chartUrl = buildChartUrl({
      notificationId: ctx.notificationId,
      webAppUrl: ctx.webAppUrl,
    })
    const monitor = buildMonitorAttribution({
      webAppUrl: ctx.webAppUrl,
      projectSlug: ctx.project?.slug,
      monitorName: payload.monitorName,
      monitorSlug: payload.monitorSlug,
      incidentKind: payload.incidentKind,
      condition: payload.condition,
    })
    const ctaUrl = isSavedSearch ? monitor?.url : issueUrl
    const subject = `Escalating: ${sourceName}`

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IncidentOpenedEmail
            incidentKind={payload.incidentKind}
            severity={payload.severity}
            sourceId={payload.sourceId}
            sourceName={sourceName}
            description={source.description ?? undefined}
            issueUrl={issueUrl}
            chartUrl={chartUrl}
            notificationCreatedAt={ctx.notificationCreatedAt}
            organizationName={ctx.organization.name}
            projectName={ctx.project?.name}
            tags={payload.tags}
            breach={payload.breach}
            sampleExcerpt={payload.sampleExcerpt}
            monitor={monitor}
            webAppUrl={ctx.webAppUrl}
          />,
        ),
      catch: (cause) => ({
        _tag: "RenderNotificationEmailError" as const,
        message: "Failed to render incident.opened email",
        cause,
      }),
    })

    return {
      html,
      subject,
      text: `${subject}.${ctaUrl ? `\n\n${ctaUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IncidentOpenedEmail
