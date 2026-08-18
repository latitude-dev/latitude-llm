import { SignalId, UserId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { UserRepository } from "@domain/users"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { SIGNAL_REPRIORITIZED_HEADING, SignalReprioritizedEmail } from "./EmailTemplate.tsx"

const loadError = (cause: unknown) => ({
  _tag: "RenderNotificationEmailError" as const,
  message: "Failed to load signal.reprioritized email data",
  cause,
})

const buildSignalUrl = (ctx: NotificationEmailRenderContext, slug: string | null): string | undefined => {
  if (!ctx.project) return undefined
  return slug
    ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals/${encodeURIComponent(slug)}`
    : `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals`
}

/**
 * "Priority raised" email. The priorities come off the payload rather than the
 * live row so a later edit doesn't rewrite the transition this email
 * announces; signal and actor display data are live-resolved and degrade to
 * neutral copy when the row is gone.
 */
export const signalReprioritizedRenderer: NotificationEmailRenderer<"signal.reprioritized"> = (payload, ctx) =>
  Effect.gen(function* () {
    const signals = yield* SignalRepository
    const signal = yield* signals.findById(SignalId(payload.signalId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )

    const users = yield* UserRepository
    const actor = yield* users.findById(UserId(payload.actorUserId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )

    const signalName = signal?.name ?? "a signal"
    const actorName = actor ? (actor.name?.trim().length ? actor.name : actor.email) : "A teammate"
    const signalUrl = buildSignalUrl(ctx, signal?.slug ?? null)
    const subject = `${SIGNAL_REPRIORITIZED_HEADING}: ${signalName}`

    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <SignalReprioritizedEmail
            signalId={payload.signalId}
            signalName={signalName}
            description={signal?.description ?? undefined}
            priority={payload.priority}
            previousPriority={payload.previousPriority}
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
        message: "Failed to render signal.reprioritized email",
        cause,
      }),
    })

    return {
      html,
      subject,
      text: `${subject}.${signalUrl ? `\n\n${signalUrl}` : ""}\n\n— Latitude`,
    }
  })

export default SignalReprioritizedEmail
