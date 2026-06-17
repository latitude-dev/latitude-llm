import { Effect } from "effect"
import { actionsLink, COLORS, contextLine, header, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

/**
 * `destination.quarantined` Slack renderer. The `destinations` group is
 * slack-routable, so this can genuinely fire — a destination stopped
 * exporting and needs a human to reconnect it. Needs nothing beyond the
 * payload + context (`R = never`); the name/kind ride on the payload.
 */
export const destinationQuarantinedRenderer: SlackNotificationRenderer<"destination.quarantined"> = (payload, ctx) => {
  const settingsUrl = ctx.project
    ? `${ctx.webAppUrl.replace(/\/$/, "")}/projects/${ctx.project.slug}/settings/data-destinations/${payload.destinationId}`
    : undefined
  return Effect.succeed({
    text: `Data destination "${payload.destinationName}" was quarantined and stopped syncing.`,
    color: COLORS.critical,
    blocks: [
      header(`:warning: Data destination quarantined`),
      sectionMarkdown(
        `*${payload.destinationName}* stopped syncing after repeated failures.${
          payload.failureMessage ? `\n_${payload.failureMessage}_` : ""
        }`,
      ),
      contextLine(`In *${ctx.project?.name ?? ctx.organization.name}* · update the API key to reconnect.`),
      ...(settingsUrl ? [actionsLink("Open data destinations", settingsUrl)] : []),
    ],
  })
}
