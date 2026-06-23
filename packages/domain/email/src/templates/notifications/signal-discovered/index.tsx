import { SignalId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"

const loadError = (cause: unknown) => ({
  _tag: "RenderNotificationEmailError" as const,
  message: "Failed to load signal.discovered email data",
  cause,
})

const buildSignalUrl = (ctx: NotificationEmailRenderContext, signalId: string): string | undefined => {
  if (!ctx.project) return undefined
  return `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals/${encodeURIComponent(signalId)}`
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

export const signalDiscoveredRenderer: NotificationEmailRenderer<"signal.discovered"> = (payload, ctx) =>
  Effect.gen(function* () {
    const signals = yield* SignalRepository
    const signal = yield* signals.findById(SignalId(payload.signalId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )

    const signalName = signal?.name ?? "A new signal"
    const signalUrl = buildSignalUrl(ctx, payload.signalId)
    const subject = `[Latitude] ${signalName} was discovered`
    const projectText = ctx.project ? ` in ${ctx.project.name}` : ""
    const html = [
      `<p>Latitude discovered a new signal${escapeHtml(projectText)}.</p>`,
      `<p><strong>${escapeHtml(signalName)}</strong></p>`,
      signal?.description ? `<p>${escapeHtml(signal.description)}</p>` : "",
      signalUrl ? `<p><a href="${escapeHtml(signalUrl)}">Open signal</a></p>` : "",
    ].join("")

    return {
      html,
      subject,
      text: `${signalName} was discovered${projectText}.${signalUrl ? `\n\n${signalUrl}` : ""}\n\n- Latitude`,
    }
  })
