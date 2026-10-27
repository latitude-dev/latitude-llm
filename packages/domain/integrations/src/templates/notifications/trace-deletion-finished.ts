import { Effect } from "effect"
import { sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/** Unreachable: `personal` is not slack-routable. Exists because the registry is exhaustive. */
export const traceDeletionFinishedRenderer: SlackNotificationRenderer<"trace-deletion.finished"> = (payload, ctx) =>
  Effect.succeed({
    text: `A trace deletion ${payload.status} in ${ctx.project?.name ?? ctx.organization.name}.`,
    blocks: [sectionMarkdown(`A trace deletion ${payload.status}.`)],
  })
