import { agentScoreImageUrl, formatTotalScore, SCORE_DIMENSION_LABELS, SCORE_DIMENSIONS } from "@domain/shared"
import type { ImageBlock } from "@slack/web-api"
import { Effect } from "effect"
import { actionsLink, contextLine, escapeMrkdwn, header, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

const signed = (delta: number): string => `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta).toFixed(1)}`

/**
 * The breakdown is drawn rather than written, and no `color` is set.
 *
 * Both are layout constraints, not taste. A `color` wraps the blocks in an attachment, and Slack
 * collapses tall attachments behind "Show more", which hid the last dimension. And Slack renders
 * emoji half again the size of its text, so a band marker per dimension line stacked into a column
 * of colliding circles. The image carries the bands instead, the way the score page does.
 */
export const agentScoreWeeklyDigestRenderer: SlackNotificationRenderer<"agent-score.weekly-digest"> = (
  payload,
  ctx,
) => {
  const projectName = ctx.project?.name ?? ctx.organization.name
  const score = formatTotalScore(payload.score)

  const movement =
    payload.comparison.status === "comparable"
      ? payload.comparison.delta === 0
        ? "unchanged this week"
        : `${signed(payload.comparison.delta)} this week${payload.comparison.significant ? "" : " (within the confidence interval)"}`
      : payload.comparison.status === "incomparable"
        ? "not comparable with last week"
        : "first score published this week"

  const breakdown: ImageBlock = {
    type: "image",
    image_url: agentScoreImageUrl(ctx.webAppUrl, {
      score: payload.score,
      dimensions: Object.fromEntries(
        SCORE_DIMENSIONS.map((dimension) => [dimension, payload.dimensions[dimension].score]),
      ),
      layout: "slack",
    }),
    alt_text: `Agent Score ${score}`,
  }

  // Slack rejects a message whose image block it cannot download, and the messenger then reposts
  // it without the image — which is every deploy whose web app is not publicly reachable. This
  // line is what carries the breakdown in that version.
  const fallback = SCORE_DIMENSIONS.map(
    (dimension) => `${SCORE_DIMENSION_LABELS[dimension]} ${payload.dimensions[dimension].score.toFixed(0)}`,
  ).join(" · ")

  return Effect.succeed({
    text: `Agent Score ${score} for ${projectName} — ${movement}`,
    blocks: [
      header(projectName),
      sectionMarkdown(`*Agent Score · ${score}* · ${escapeMrkdwn(movement)}`),
      breakdown,
      contextLine(escapeMrkdwn(fallback)),
      contextLine(`${escapeMrkdwn(ctx.organization.name)} · scored on ${payload.publishedDayCount} of the last 7 days`),
      ...(ctx.project
        ? [
            actionsLink(
              "Open Agent Score",
              `${ctx.webAppUrl}/projects/${ctx.project.slug}/agent-score?date=${payload.date}`,
            ),
          ]
        : []),
    ],
  })
}
