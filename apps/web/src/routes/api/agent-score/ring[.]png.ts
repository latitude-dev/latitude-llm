import { LAUNCH_AGENT_SCORE_ARTIFACT } from "@domain/agent-score"
import { createLogger } from "@repo/observability"
import { createFileRoute } from "@tanstack/react-router"
import { parseScoreParams } from "../../../domains/agent-score/score-image/parse-score-params.ts"
import {
  renderScoreCardPng,
  renderScoreRingPng,
  renderScoreSlackCardPng,
} from "../../../domains/agent-score/score-image/render-score-image.ts"
import { respondFallback, respondRendered } from "../../../domains/agent-score/score-image/respond.ts"

const logger = createLogger("agent-score.ring-image")

/**
 * The Agent Score ring, rendered for the weekly digest's email and Slack message.
 *
 * Unauthenticated and unsigned, unlike the per-notification incident chart next door. That route
 * keys on a notification id because its payload is project-internal trend data; this one's entire
 * payload is scores between 0 and 100 read off the query string. There is no tenant in it to leak,
 * which is also what lets the response be cached by value across every organisation.
 *
 * `?layout=card` renders the ring-plus-trend the email leads with, `?layout=slack` the
 * ring-plus-dimension-meters the Slack message shows, and no layout the square ring on its own.
 *
 * Any failure degrades to a 1×1 transparent PNG rather than an error status: these images sit in
 * somebody's inbox, and a broken-image icon is worse than a missing one. The text around them
 * already carries every number the image shows. The fallback is served uncached, so a transient
 * failure is retried on the next fetch instead of sticking to every organisation's copy of that URL.
 */
export const Route = createFileRoute("/api/agent-score/ring.png")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const url = new URL(request.url)
          const { score, dimensions, series } = parseScoreParams(url)
          const input = { score, dimensions, weights: LAUNCH_AGENT_SCORE_ARTIFACT.compositeWeights }

          const layout = url.searchParams.get("layout")
          const png =
            layout === "card"
              ? await renderScoreCardPng({ ...input, series })
              : layout === "slack"
                ? await renderScoreSlackCardPng(input)
                : await renderScoreRingPng(input)

          return respondRendered(png)
        } catch (error) {
          logger.error("agent-score ring render failed", error)
          return respondFallback()
        }
      },
    },
  },
})
