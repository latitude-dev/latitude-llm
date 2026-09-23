import { agentScoreImageUrl, formatTotalScore, SCORE_DIMENSION_LABELS, SCORE_DIMENSIONS } from "@domain/shared"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderer } from "../types.ts"
import { buildHeadline, buildSubject, describeCoverage, describeMovement } from "./copy.ts"
import { AgentScoreWeeklyDigestEmail, formatDelta, formatScore } from "./EmailTemplate.tsx"

/**
 * Renderer for `agent-score.weekly-digest`. Payload-only: the week's numbers were snapshotted by
 * the producer, so nothing is read back here. The project's name and slug come from `ctx.project`,
 * which is `null` when the project was deleted between the digest and the send — the copy falls
 * back to the organisation and the CTA is dropped rather than pointing at a dead route.
 */
export const agentScoreWeeklyDigestRenderer: NotificationEmailRenderer<"agent-score.weekly-digest"> = (payload, ctx) =>
  Effect.tryPromise({
    try: async () => {
      const projectName = ctx.project?.name ?? null
      const headline = buildHeadline(projectName)
      const movement = describeMovement(payload.comparison)
      const coverage = describeCoverage(payload)
      const scoreUrl = ctx.project
        ? `${ctx.webAppUrl.replace(/\/$/, "")}/projects/${ctx.project.slug}/agent-score?date=${payload.date}`
        : null
      const cardImageUrl = agentScoreImageUrl(ctx.webAppUrl, {
        score: payload.score,
        dimensions: Object.fromEntries(
          SCORE_DIMENSIONS.map((dimension) => [dimension, payload.dimensions[dimension].score]),
        ),
        series: payload.series.map((point) => point.score),
        layout: "card",
      })

      const dimensionLines = SCORE_DIMENSIONS.map((dimension) => {
        const entry = payload.dimensions[dimension]
        const delta = entry.delta === null ? "" : ` (${formatDelta(entry.delta)})`
        return `• ${SCORE_DIMENSION_LABELS[dimension]}: ${formatScore(entry.score)}${delta}`
      }).join("\n")

      return {
        html: await renderEmail(
          <AgentScoreWeeklyDigestEmail
            projectName={projectName}
            organizationName={ctx.organization.name}
            score={payload.score}
            movement={movement}
            headline={headline}
            coverage={coverage}
            dimensions={payload.dimensions}
            cardImageUrl={cardImageUrl}
            scoreUrl={scoreUrl}
            webAppUrl={ctx.webAppUrl}
          />,
        ),
        subject: buildSubject(payload, projectName),
        text: `${headline}\n\n${formatTotalScore(payload.score)} — ${movement}\n\n${dimensionLines}\n\n${coverage}${
          scoreUrl ? `\n\nSee the full breakdown:\n${scoreUrl}` : ""
        }`,
      }
    },
    catch: (cause) => ({
      _tag: "RenderNotificationEmailError" as const,
      message: "Failed to render agent-score.weekly-digest email",
      cause,
    }),
  })

export default AgentScoreWeeklyDigestEmail
