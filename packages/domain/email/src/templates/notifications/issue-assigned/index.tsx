import { IssueRepository } from "@domain/issues"
import { IssueId, UserId } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { IssueAssignedEmail } from "./EmailTemplate.tsx"

const loadError = (cause: unknown) => ({
  _tag: "RenderNotificationEmailError" as const,
  message: "Failed to load issue.assigned email data",
  cause,
})

const buildIssueUrl = (ctx: NotificationEmailRenderContext, issueId: string): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues/${encodeURIComponent(issueId)}`
}

/**
 * "You were assigned to <issue>" email. Issue and actor display data are
 * live-resolved from the payload ids (the payload deliberately carries no
 * names); both degrade to neutral copy when the row is gone so the email
 * still reads.
 */
export const issueAssignedRenderer: NotificationEmailRenderer<"issue.assigned"> = (payload, ctx) =>
  Effect.gen(function* () {
    const issues = yield* IssueRepository
    const issue = yield* issues.findById(IssueId(payload.issueId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )

    const users = yield* UserRepository
    const actor = yield* users.findById(UserId(payload.actorUserId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )

    const issueName = issue?.name ?? "an issue"
    const actorName = actor ? (actor.name?.trim().length ? actor.name : actor.email) : "A teammate"
    const subject = `You were assigned to ${issueName}`
    const issueUrl = buildIssueUrl(ctx, payload.issueId)

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <IssueAssignedEmail
            issueId={payload.issueId}
            issueName={issueName}
            description={issue?.description ?? undefined}
            actorName={actorName}
            issueUrl={issueUrl}
            notificationCreatedAt={ctx.notificationCreatedAt}
            organizationName={ctx.organization.name}
            projectName={ctx.project?.name}
            webAppUrl={ctx.webAppUrl}
          />,
        ),
      catch: (cause) => ({
        _tag: "RenderNotificationEmailError" as const,
        message: "Failed to render issue.assigned email",
        cause,
      }),
    })

    return {
      html,
      subject,
      text: `${subject}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
    }
  })

export default IssueAssignedEmail
