import { SignalId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import { actionsLink, contextLine, projectOrOrgContext, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const signalRegressedRenderer: SlackNotificationRenderer<"signal.regressed"> = (payload, ctx) =>
  Effect.gen(function* () {
    const signals = yield* SignalRepository
    const signal = yield* signals.findById(SignalId(payload.signalId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )

    const projectName = ctx.project?.name ?? ctx.organization.name
    const signalName = signal?.name ?? "A resolved signal"
    const signalUrl = ctx.project
      ? signal
        ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals/${encodeURIComponent(signal.slug)}`
        : `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals`
      : ctx.webAppUrl

    return {
      text: `${signalName} regressed in ${projectName}.`,
      blocks: [
        sectionMarkdown(`A resolved signal came back and was reopened: *<${signalUrl}|${signalName}>*.`),
        ...(signal?.description ? [sectionMarkdown(signal.description)] : []),
        contextLine(`signal · ${projectOrOrgContext(ctx.organization, ctx.project)}`),
        actionsLink("View signal", signalUrl),
      ],
    }
  })
