import { SignalRepository } from "@domain/signals"
import { SignalId, UserId } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { SignalAssignedEmail } from "./EmailTemplate.tsx"

const loadError = (cause: unknown) => ({
  _tag: "RenderNotificationEmailError" as const,
  message: "Failed to load issue.assigned email data",
  cause,
})

const buildSignalUrl = (ctx: NotificationEmailRenderContext, signalId: string): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/issues/${encodeURIComponent(signalId)}`
}

/**
 * "You were assigned to <issue>" email. Signal and actor display data are
 * live-resolved from the payload ids (the payload deliberately carries no
 * names); both degrade to neutral copy when the row is gone so the email
 * still reads.
 */
export const signalAssignedRenderer: NotificationEmailRenderer<"issue.assigned"> = (payload, ctx) =>
  Effect.gen(function* () {
    const issues = yield* SignalRepository
    const issue = yield* issues.findById(SignalId(payload.signalId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )

    const users = yield* UserRepository
    const actor = yield* users.findById(UserId(payload.actorUserId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )

    const signalName = issue?.name ?? "an issue"
    const actorName = actor ? (actor.name?.trim().length ? actor.name : actor.email) : "A teammate"
    const subject = `You were assigned to ${signalName}`
    const signalUrl = buildSignalUrl(ctx, payload.signalId)

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <SignalAssignedEmail
            signalId={payload.signalId}
            signalName={signalName}
            description={issue?.description ?? undefined}
            actorName={actorName}
            signalUrl={signalUrl}
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
      text: `${subject}.${signalUrl ? `\n\n${signalUrl}` : ""}\n\n— Latitude`,
    }
  })

export default SignalAssignedEmail
