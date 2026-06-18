import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { buildChartUrl } from "../../../helpers/chart-url.ts"
import { renderEmail } from "../../../utils/render.ts"
import { buildMonitorAttribution } from "../-incident-components.tsx"
import { resolveAssigneeName, resolveIncidentSource } from "../-incident-source.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { IncidentClosedEmail } from "./EmailTemplate.tsx"

const buildSignalUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.closed">>[0],
): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals/${encodeURIComponent(payload.sourceId)}`
}

export const incidentClosedRenderer: NotificationEmailRenderer<"incident.closed"> = (payload, ctx) =>
  Effect.gen(function* () {
    const isSavedSearch = payload.sourceType === "savedSearch"
    const source = yield* resolveIncidentSource(payload)
    const assigneeName = yield* resolveAssigneeName(payload.assigneeId)
    const sourceName = source.name ?? (isSavedSearch ? "a saved search" : "a signal")
    const signalUrl = isSavedSearch ? undefined : buildSignalUrl(ctx, payload)

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
    const ctaUrl = isSavedSearch ? monitor?.url : signalUrl
    const subject = `Resolved: escalation on ${sourceName}`

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IncidentClosedEmail
            incidentKind={payload.incidentKind}
            severity={payload.severity}
            sourceId={payload.sourceId}
            sourceName={sourceName}
            description={source.description ?? undefined}
            signalUrl={signalUrl}
            chartUrl={chartUrl}
            notificationCreatedAt={ctx.notificationCreatedAt}
            organizationName={ctx.organization.name}
            projectName={ctx.project?.name}
            priority={payload.priority ?? undefined}
            assigneeName={assigneeName ?? undefined}
            recovery={payload.recovery}
            monitor={monitor}
            webAppUrl={ctx.webAppUrl}
          />,
        ),
      catch: (cause) => ({
        _tag: "RenderNotificationEmailError" as const,
        message: "Failed to render incident.closed email",
        cause,
      }),
    })

    return {
      html,
      subject,
      text: `${subject}.${ctaUrl ? `\n\n${ctaUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IncidentClosedEmail
