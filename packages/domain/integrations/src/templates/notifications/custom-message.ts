import { Effect } from "effect"
import { actionsLink, COLORS, contextLine, header, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

export const customMessageRenderer: SlackNotificationRenderer<"custom.message"> = (payload, ctx) =>
  Effect.succeed({
    text: payload.title,
    color: COLORS.announcement,
    blocks: [
      header(`:loudspeaker: ${payload.title}`),
      ...(payload.content ? [sectionMarkdown(payload.content)] : []),
      contextLine(`From *${ctx.organization.name}*`),
      ...(payload.link ? [actionsLink("Learn more", payload.link)] : []),
    ],
  })
