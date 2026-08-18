import { SignalId } from "@domain/shared"
import { type SignalPriority, SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import {
  actionsLink,
  contextLine,
  priorityLabel,
  projectOrOrgContext,
  sectionMarkdown,
  severityColor,
} from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

const previousPriorityLabel = (priority: SignalPriority | null): string => (priority ? priorityLabel(priority) : "None")

export const signalReprioritizedRenderer: SlackNotificationRenderer<"signal.reprioritized"> = (payload, ctx) =>
  Effect.gen(function* () {
    const signals = yield* SignalRepository
    const signal = yield* signals.findById(SignalId(payload.signalId)).pipe(
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )

    const projectName = ctx.project?.name ?? ctx.organization.name
    const signalName = signal?.name ?? "A signal"
    const signalUrl = ctx.project
      ? signal
        ? `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals/${encodeURIComponent(signal.slug)}`
        : `${ctx.webAppUrl}/projects/${ctx.project.slug}/signals`
      : ctx.webAppUrl
    const transition = `${previousPriorityLabel(payload.previousPriority)} → ${priorityLabel(payload.priority)}`

    return {
      text: `Priority raised on ${signalName} in ${projectName}.`,
      blocks: [
        sectionMarkdown(`Priority raised on *<${signalUrl}|${signalName}>*: ${transition}.`),
        ...(signal?.description ? [sectionMarkdown(signal.description)] : []),
        contextLine(`signal · ${projectOrOrgContext(ctx.organization, ctx.project)}`),
        actionsLink("View signal", signalUrl),
      ],
      color: severityColor(payload.severity),
    }
  })
