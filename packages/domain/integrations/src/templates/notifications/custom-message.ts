import { Effect } from "effect"
import { actionsLink, contextLine, header, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/**
 * Admin-authored ad-hoc message. Only `title` is required; `content`
 * and `link` are optional. Org-scoped — no project context line.
 */
export const customMessageRenderer: SlackNotificationRenderer<"custom.message"> = (payload, ctx) =>
  Effect.succeed({
    text: payload.title,
    blocks: [
      header(`:loudspeaker: ${payload.title}`),
      ...(payload.content ? [sectionMarkdown(payload.content)] : []),
      contextLine(`From *${ctx.organization.name}*`),
      ...(payload.link ? [actionsLink("Learn more", payload.link)] : []),
    ],
  })
