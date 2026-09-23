import {
  SCORE_DIMENSION_DESCRIPTIONS,
  SCORE_DIMENSION_LABELS,
  SCORE_DIMENSIONS,
  type ScoreDimension,
  scoreBandColor,
} from "@domain/shared"
import { Img, Section, Text } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailFooter } from "../../../components/EmailFooter.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface AgentScoreWeeklyDigestEmailProps {
  readonly projectName: string | null
  readonly organizationName: string
  readonly score: number
  readonly movement: string
  readonly headline: string
  readonly coverage: string
  readonly dimensions: Record<ScoreDimension, { readonly score: number; readonly delta: number | null }>
  readonly cardImageUrl: string
  readonly scoreUrl: string | null
  readonly webAppUrl: string
}

const MUTED = "#66727F"
const BORDER = "#EEF0F2"

export const formatScore = (value: number): string => value.toFixed(0)

/** Signed to one decimal, because a weekly move is often smaller than a whole point. */
export const formatDelta = (delta: number): string =>
  `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta).toFixed(1)}`

/**
 * One row per dimension, mirroring the score page's cards: the name and what it asks on the left,
 * the score in its band colour on the right. Colour lives on the text rather than only in the
 * hero image so a recipient with images turned off still sees which dimension is the weak one.
 */
function DimensionRows({ dimensions }: Pick<AgentScoreWeeklyDigestEmailProps, "dimensions">) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {SCORE_DIMENSIONS.map((dimension, index) => {
          const entry = dimensions[dimension]
          return (
            <tr key={dimension}>
              <td
                style={{
                  padding: "12px 0",
                  borderTop: index === 0 ? "none" : `1px solid ${BORDER}`,
                  verticalAlign: "middle",
                }}
              >
                <Text style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0F172A" }}>
                  {SCORE_DIMENSION_LABELS[dimension]}
                </Text>
                <Text style={{ margin: "2px 0 0 0", fontSize: 13, color: MUTED }}>
                  {SCORE_DIMENSION_DESCRIPTIONS[dimension]}
                </Text>
              </td>
              <td
                style={{
                  padding: "12px 0",
                  borderTop: index === 0 ? "none" : `1px solid ${BORDER}`,
                  textAlign: "right",
                  verticalAlign: "middle",
                  whiteSpace: "nowrap",
                  width: 96,
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 600,
                    color: scoreBandColor(entry.score),
                  }}
                >
                  {formatScore(entry.score)}
                </Text>
                {entry.delta === null ? null : (
                  <Text style={{ margin: "2px 0 0 0", fontSize: 12, color: MUTED }}>{formatDelta(entry.delta)}</Text>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function AgentScoreWeeklyDigestEmail({
  projectName,
  organizationName,
  score,
  movement,
  headline,
  coverage,
  dimensions,
  cardImageUrl,
  scoreUrl,
  webAppUrl,
}: AgentScoreWeeklyDigestEmailProps) {
  return (
    <ContainerLayout
      previewText={`${score.toFixed(1)} — ${movement}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "agent_score" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {headline}
      </EmailText>
      <Text style={{ margin: "0 0 16px 0", fontSize: 14, color: MUTED }}>
        {projectName ? `${organizationName} / ${projectName}` : organizationName}
      </Text>

      {/* The score lives in the alt text too: most clients block remote images by default, and the
          number is the one thing the reader opened this for. */}
      <Img
        src={cardImageUrl}
        alt={`Agent Score ${score.toFixed(1)} — ${movement}`}
        width="552"
        style={{ width: "100%", maxWidth: 552, height: "auto", display: "block" }}
      />

      <Text style={{ margin: "12px 0 0 0", fontSize: 15, color: "#0F172A" }}>{movement}</Text>
      <Text style={{ margin: "4px 0 24px 0", fontSize: 13, color: MUTED }}>{coverage}</Text>

      <DimensionRows dimensions={dimensions} />

      {scoreUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={scoreUrl} label="Open Agent Score" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

AgentScoreWeeklyDigestEmail.PreviewProps = {
  projectName: "checkout-agent",
  organizationName: "Acme Inc.",
  score: 71.4,
  movement: "Up 2.5 points since Sep 17, which is within the confidence interval either way.",
  headline: "Your Agent Score for checkout-agent",
  coverage: "Scored on 5 of the last 7 days, over a rolling 7-day window of 1,312 sessions.",
  dimensions: {
    outcome: { score: 74, delta: 2.5 },
    reliability: { score: 81, delta: 0 },
    cost: { score: 52, delta: -1.2 },
    speed: { score: 70, delta: 4.1 },
    safety: { score: 92, delta: null },
  },
  cardImageUrl:
    "http://localhost:3000/api/agent-score/ring.png?score=71.4&d=74,81,52,70,92&card=1&s=68.9,69,70.2,69.8,71,71.4",
  scoreUrl: "http://localhost:3000/projects/checkout-agent/agent-score?date=2026-09-21",
  webAppUrl: "http://localhost:3000",
} satisfies AgentScoreWeeklyDigestEmailProps
