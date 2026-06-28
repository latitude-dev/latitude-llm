import { Effect } from "effect"
import { sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const signalDiscoveredRenderer: SlackNotificationRenderer<"signal.discovered"> = (_payload, ctx) =>
  Effect.succeed({
    text: `A new signal was discovered in ${ctx.project?.name ?? ctx.organization.name}.`,
    blocks: [sectionMarkdown(`A new signal was discovered in ${ctx.project?.name ?? ctx.organization.name}.`)],
  })
