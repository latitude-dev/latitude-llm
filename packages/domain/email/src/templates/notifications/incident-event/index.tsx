import { IssueRepository } from "@domain/issues"
import { IssueId } from "@domain/shared"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import { resolveIncidentIssueAppHref } from "../incident-issue-link.ts"
import type { NotificationEmailRenderer } from "../types.ts"
import { ALERT_KIND_TO_LABEL, IncidentEventEmail } from "./EmailTemplate.tsx"

export const incidentEventRenderer: NotificationEmailRenderer<"incident.event"> = (payload, ctx) =>
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
    const issueUrl = resolveIncidentIssueAppHref(ctx, payload)

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IncidentEventEmail
            userName={userName}
            incidentKind={payload.incidentKind}
            issueName={issue?.name ?? undefined}
            issueUrl={issueUrl}
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
      subject: `[Latitude] ${label}: ${issueRef}`,
      text: `Hi ${userName},\n\n${label}: ${issueRef}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IncidentEventEmail
