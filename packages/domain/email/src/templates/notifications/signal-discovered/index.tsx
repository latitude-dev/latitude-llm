import { SignalId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { SignalDiscoveredEmail } from "./EmailTemplate.tsx"

const loadError = (cause: unknown) => ({
  _tag: "RenderNotificationEmailError" as const,
  message: "Failed to load signal.discovered email data",
  cause,
})

const buildSignalUrl = (ctx: NotificationEmailRenderContext, slug: string | null): string | undefined => {
  if (!ctx.project) return undefined
  return slug
    ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals/${encodeURIComponent(slug)}`
    : `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals`
}

export const signalDiscoveredRenderer: NotificationEmailRenderer<"signal.discovered"> = (payload, ctx) =>
  Effect.gen(function* () {
    const signals = yield* SignalRepository
    const signal = yield* signals.findById(SignalId(payload.signalId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )

    const signalName = signal?.name ?? "a signal"
    const signalUrl = buildSignalUrl(ctx, signal?.slug ?? null)
    const subject = `Signal discovered: ${signalName}`
    const html = yield* Effect.tryPromise({
      try: () =>
        renderEmail(
          <SignalDiscoveredEmail
            signalId={payload.signalId}
            signalName={signalName}
            description={signal?.description ?? undefined}
            signalUrl={signalUrl}
            notificationCreatedAt={ctx.notificationCreatedAt}
            organizationName={ctx.organization.name}
            projectName={ctx.project?.name}
            webAppUrl={ctx.webAppUrl}
          />,
        ),
      catch: (cause) => ({
        _tag: "RenderNotificationEmailError" as const,
        message: "Failed to render signal.discovered email",
        cause,
      }),
    })

    return {
      html,
      subject,
      text: `${subject}.${signalUrl ? `\n\n${signalUrl}` : ""}\n\n— Latitude`,
    }
  })

export default SignalDiscoveredEmail
