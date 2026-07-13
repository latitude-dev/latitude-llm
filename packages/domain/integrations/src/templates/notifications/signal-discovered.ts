import { SignalId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import { actionsLink, contextLine, projectOrOrgContext, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const signalDiscoveredRenderer: SlackNotificationRenderer<"signal.discovered"> = (payload, ctx) =>
  Effect.gen(function* () {
    const signals = yield* SignalRepository
    const signal = yield* signals.findById(SignalId(payload.signalId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )

    const projectName = ctx.project?.name ?? ctx.organization.name
    const signalName = signal?.name ?? "A new signal"
    const signalUrl = ctx.project
      ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals/${encodeURIComponent(payload.signalId)}`
      : ctx.webAppUrl

    return {
      text: `${signalName} was discovered in ${projectName}.`,
      blocks: [
        sectionMarkdown(`A new signal was discovered: *<${signalUrl}|${signalName}>*.`),
        ...(signal?.description ? [sectionMarkdown(signal.description)] : []),
        contextLine(`signal · ${projectOrOrgContext(ctx.organization, ctx.project)}`),
        actionsLink("View signal", signalUrl),
      ],
    }
  })
