import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { buildChartUrl } from "../../../helpers/chart-url.ts"
import { renderEmail } from "../../../utils/render.ts"
import { buildMonitorAttribution } from "../-incident-components.tsx"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { IncidentClosedEmail } from "./EmailTemplate.tsx"

const buildSourceUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.closed">>[0],
): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${encodeURIComponent(payload.sourceId)}`
}

export const incidentClosedRenderer: NotificationEmailRenderer<"incident.closed"> = (payload, ctx) =>
  Effect.gen(function* () {
    const issues = yield* IssueRepository
    const issue = yield* issues.findById(IssueId(payload.sourceId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) =>
        Effect.fail({
          _tag: "RenderNotificationEmailError" as const,
          message: "Failed to load incident source issue",
          cause,
        }),
      ),
    )
    const issueRef = issue?.name ?? "an issue"
    const issueUrl = buildSourceUrl(ctx, payload)

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

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IncidentClosedEmail
            severity={payload.severity}
            issueId={payload.sourceId}
            issueName={issue?.name ?? undefined}
            issueDescription={issue?.description ?? undefined}
            issueUrl={issueUrl}
            chartUrl={chartUrl}
            notificationCreatedAt={ctx.notificationCreatedAt}
            organizationName={ctx.organization.name}
            projectName={ctx.project?.name}
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
      subject: `Resolved: escalation on ${issueRef}`,
      text: `Resolved: escalation on ${issueRef}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IncidentClosedEmail
