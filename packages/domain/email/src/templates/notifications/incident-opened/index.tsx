import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { buildSignedChartUrl } from "../../../helpers/signed-chart-url.ts"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { ALERT_KIND_TO_LABEL, IncidentOpenedEmail } from "./EmailTemplate.tsx"

const buildSourceUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.opened">>[0],
): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${encodeURIComponent(payload.sourceId)}`
}

export const incidentOpenedRenderer: NotificationEmailRenderer<"incident.opened"> = (payload, ctx) =>
  Effect.gen(function* () {
    const userName = ctx.recipient.name ?? "there"
    const label = ALERT_KIND_TO_LABEL[payload.incidentKind]

    // Live-resolve the issue's display name — the payload only carries
    // `sourceId`, and a snapshot would go stale on rename. Falls back to
    // a generic label if the issue can't be found (e.g. hard-deleted).
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

    const chartUrl = yield* buildSignedChartUrl({
      notificationId: ctx.notificationId,
      apiBaseUrl: ctx.apiBaseUrl,
      secret: ctx.chartSecret,
    })

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IncidentOpenedEmail
            userName={userName}
            incidentKind={payload.incidentKind}
            issueName={issue?.name ?? undefined}
            issueUrl={issueUrl}
            chartUrl={chartUrl}
            tags={payload.tags}
            breach={payload.breach}
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
      subject: `[Latitude] Escalating: ${issueRef}`,
      text: `Hi ${userName},\n\n${label}: ${issueRef}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IncidentOpenedEmail
