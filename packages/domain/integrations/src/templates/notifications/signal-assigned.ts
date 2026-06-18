import { Effect } from "effect"
import { sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/**
 * Unreachable in practice: `issue.assigned` belongs to the `personal`
 * group, which is not slack-routable — the routes settings hide it, the
 * route-config server fns reject it, and the worker's Slack fan-out skips
 * it. The renderer exists only because the registry is an exhaustive
 * `Record<NotificationKind, …>` (kept that way on purpose: every new kind
 * must make an explicit Slack decision). Renders a minimal generic message
 * if a future change ever routes it anyway.
 */
export const signalAssignedRenderer: SlackNotificationRenderer<"issue.assigned"> = (_payload, ctx) =>
  Effect.succeed({
    text: `A signal was assigned in ${ctx.project?.name ?? ctx.organization.name}.`,
    blocks: [sectionMarkdown("A signal was assigned.")],
  })
