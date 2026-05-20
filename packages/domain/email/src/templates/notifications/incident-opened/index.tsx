import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { buildChartUrl } from "../../../helpers/chart-url.ts"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { IncidentOpenedEmail } from "./EmailTemplate.tsx"

const buildSourceUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.opened">>[0],
): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${encodeURIComponent(payload.sourceId)}`
}

export const incidentOpenedRenderer: NotificationEmailRenderer<"incident.opened"> = (payload, ctx) =>
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

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IncidentOpenedEmail
            severity={payload.severity}
            issueId={payload.sourceId}
            issueName={issue?.name ?? undefined}
            issueDescription={issue?.description ?? undefined}
            issueUrl={issueUrl}
            chartUrl={chartUrl}
            notificationCreatedAt={ctx.notificationCreatedAt}
            organizationName={ctx.organization.name}
            projectName={ctx.project?.name}
            tags={payload.tags}
            breach={payload.breach}
            sampleExcerpt={payload.sampleExcerpt}
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
      subject: `Escalating: ${issueRef}`,
      text: `Escalating issue: ${issueRef}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IncidentOpenedEmail
