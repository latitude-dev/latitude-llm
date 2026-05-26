import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { IncidentEventEmail } from "./EmailTemplate.tsx"

const ALERT_KIND_TO_SUBJECT: Record<string, string> = {
  "issue.new": "New issue",
  "issue.regressed": "Regressed issue",
  "issue.escalating": "Escalating issue",
}

const buildSourceUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.event">>[0],
): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues?issueId=${encodeURIComponent(payload.sourceId)}`
}

export const incidentEventRenderer: NotificationEmailRenderer<"incident.event"> = (payload, ctx) =>
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
    const heading = ALERT_KIND_TO_SUBJECT[payload.incidentKind] ?? "Incident"

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IncidentEventEmail
            incidentKind={payload.incidentKind}
            severity={payload.severity}
            issueId={payload.sourceId}
            issueName={issue?.name ?? undefined}
            issueDescription={issue?.description ?? undefined}
            issueUrl={issueUrl}
            notificationCreatedAt={ctx.notificationCreatedAt}
            organizationName={ctx.organization.name}
            projectName={ctx.project?.name}
            tags={payload.tags}
            sampleExcerpt={payload.sampleExcerpt}
            webAppUrl={ctx.webAppUrl}
          />,
        ),
      catch: (cause) => ({
        _tag: "RenderNotificationEmailError" as const,
        message: "Failed to render incident.event email",
        cause,
      }),
    })

    return {
      html,
      subject: `${heading}: ${issueRef}`,
      text: `${heading}: ${issueRef}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IncidentEventEmail
