import { SCORE_DIMENSION_LABELS, SCORE_DIMENSIONS } from "@domain/shared"
import { Effect } from "effect"
import { actionsLink, COLORS, contextLine, escapeMrkdwn, header, sectionMarkdown } from "./blocks.ts"
import type { SlackNotificationRenderer } from "./types.ts"

const signed = (delta: number): string => `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta).toFixed(1)}`

export const agentScoreWeeklyDigestRenderer: SlackNotificationRenderer<"agent-score.weekly-digest"> = (
  payload,
  ctx,
) => {
  const projectName = ctx.project?.name ?? ctx.organization.name
  const score = payload.score.toFixed(0)

  const movement =
    payload.comparison.status === "comparable"
      ? payload.comparison.delta === 0
        ? "unchanged this week"
        : `${signed(payload.comparison.delta)} this week${payload.comparison.significant ? "" : " (within the confidence interval)"}`
      : payload.comparison.status === "incomparable"
        ? "not comparable with last week"
        : "first score published this week"

  const dimensions = SCORE_DIMENSIONS.map((dimension) => {
    const entry = payload.dimensions[dimension]
    const delta = entry.delta === null ? "" : ` (${signed(entry.delta)})`
    return `${SCORE_DIMENSION_LABELS[dimension]} ${entry.score.toFixed(0)}${delta}`
  }).join(" · ")

  return Effect.succeed({
    text: `Agent Score ${score} for ${projectName} — ${movement}`,
    color: COLORS.agentScore,
    blocks: [
      header(`Agent Score · ${projectName}`),
      sectionMarkdown(`*${score}* — ${escapeMrkdwn(movement)}`),
      contextLine(escapeMrkdwn(dimensions)),
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
