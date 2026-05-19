import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { ALERT_KIND_TO_LABEL, IncidentClosedEmail } from "./EmailTemplate.tsx"

const buildSourceUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.closed">>[0],
): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${encodeURIComponent(payload.sourceId)}`
}

export const incidentClosedRenderer: NotificationEmailRenderer<"incident.closed"> = (payload, ctx) =>
  Effect.gen(function* () {
    const userName = ctx.recipient.name ?? "there"
    const label = ALERT_KIND_TO_LABEL[payload.incidentKind]

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

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IncidentClosedEmail
            userName={userName}
            incidentKind={payload.incidentKind}
            issueName={issue?.name ?? undefined}
            issueUrl={issueUrl}
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
      subject: `[Latitude] ${label} resolved: ${issueRef}`,
      text: `Hi ${userName},\n\n${label} resolved: ${issueRef}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IncidentClosedEmail
