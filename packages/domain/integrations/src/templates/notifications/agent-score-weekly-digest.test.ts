import type { AgentScoreWeeklyDigestPayload } from "@domain/notifications"
import { ProjectId } from "@domain/shared"
import type { ImageBlock, KnownBlock } from "@slack/web-api"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { agentScoreWeeklyDigestRenderer } from "./agent-score-weekly-digest.ts"
import type { SlackRenderContext } from "./types.ts"

const payload = (overrides: Partial<AgentScoreWeeklyDigestPayload> = {}): AgentScoreWeeklyDigestPayload => ({
  projectId: "p".repeat(24),
  date: "2026-09-21",
  windowStart: "2026-09-16",
  windowEnd: "2026-09-22",
  score: 67.9,
  interval: { lower: 66, upper: 70 },
  scoringVersion: "agent-score-v5-provisional",
  windowDays: 7,
  eligibleSessionCount: 1312,
  publishedDayCount: 7,
  series: [{ date: "2026-09-21", score: 67.9 }],
  dimensions: {
    outcome: { score: 75, delta: 11.7 },
    reliability: { score: 60, delta: 3.7 },
    cost: { score: 66, delta: 15.7 },
    speed: { score: 72, delta: 9.2 },
    safety: { score: 92, delta: 15.2 },
  },
  comparison: {
    status: "comparable",
    baselineDate: "2026-09-16",
    baselineScore: 58.2,
    delta: 9.7,
    significant: true,
  },
  ...overrides,
})

const ctx = (
  project: SlackRenderContext["project"] = {
    id: ProjectId("p".repeat(24)),
    name: "Support Agent",
    slug: "support-agent",
  },
) =>
  ({
    webAppUrl: "https://app.example",
    organization: { id: "o".repeat(24), name: "Acme Inc." },
    project,
    notificationId: null,
  }) as SlackRenderContext

const render = (input = payload(), context = ctx()) => Effect.runSync(agentScoreWeeklyDigestRenderer(input, context))

const imageOf = (blocks: readonly KnownBlock[]): ImageBlock | undefined =>
  blocks.find((block): block is ImageBlock => block.type === "image")

describe("agentScoreWeeklyDigestRenderer", () => {
  it("sets no colour, so Slack posts top-level blocks rather than an attachment it can collapse", () => {
    expect(render().color).toBeUndefined()
  })

  it("draws the breakdown as one image carrying every dimension's score", () => {
    const image = imageOf(render().blocks)

    expect(image).toBeDefined()
    const url = new URL(image && "image_url" in image ? image.image_url : "")
    expect(url.searchParams.get("layout")).toBe("slack")
    expect(url.searchParams.get("score")).toBe("67.9")
    expect(url.searchParams.get("d")).toBe("75,60,66,72,92")
  })

  it("writes every dimension into a text line too, for when Slack cannot fetch the image", () => {
    const text = JSON.stringify(render().blocks)

    for (const label of ["Outcome quality 75", "Reliability 60", "Cost 66", "Speed 72", "Safety 92"]) {
      expect(text).toContain(label)
    }
  })

  it("uses no emoji anywhere, which Slack renders large enough to collide", () => {
    expect(JSON.stringify(render())).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it("titles the message with the project and leads with the score and its move", () => {
    const result = render()

    expect(JSON.stringify(result.blocks[0])).toContain("Support Agent")
    expect(JSON.stringify(result.blocks[1])).toContain("Agent Score · 67.9")
    expect(JSON.stringify(result.blocks[1])).toContain("+9.7 this week")
  })

  it("qualifies a move the intervals do not separate from noise", () => {
    const result = render(
      payload({
        comparison: {
          status: "comparable",
          baselineDate: "2026-09-16",
          baselineScore: 66.7,
          delta: 1.2,
          significant: false,
        },
      }),
    )

    expect(JSON.stringify(result.blocks[1])).toContain("within the confidence interval")
  })

  it("falls back to the organization and drops the link when the project is gone", () => {
    const result = render(payload(), ctx(null))

    expect(JSON.stringify(result.blocks[0])).toContain("Acme Inc.")
    expect(result.blocks.some((block) => block.type === "actions")).toBe(false)
  })
})
