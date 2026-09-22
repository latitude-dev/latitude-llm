import { SCORE_DIMENSION_LABELS, SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import { Section, Text } from "@react-email/components"
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
  readonly scoreUrl: string | null
  readonly webAppUrl: string
}

const UP = "#15803D"
const DOWN = "#B91C1C"
const STEADY = "#64748B"

export const formatScore = (value: number): string => value.toFixed(0)

/** Signed to one decimal, because a weekly move is often smaller than a whole point. */
export const formatDelta = (delta: number): string =>
  `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta).toFixed(1)}`

const deltaColor = (delta: number | null): string => {
  if (delta === null || delta === 0) return STEADY
  return delta > 0 ? UP : DOWN
}

function DimensionTable({ dimensions }: Pick<AgentScoreWeeklyDigestEmailProps, "dimensions">) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
      <tbody>
        {SCORE_DIMENSIONS.map((dimension) => {
          const entry = dimensions[dimension]
          return (
            <tr key={dimension}>
              <td
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#F8FAFC",
                  color: "#64748B",
                  fontSize: 13,
                  borderRadius: "6px 0 0 6px",
                }}
              >
                {SCORE_DIMENSION_LABELS[dimension]}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #F1F5F9",
                  color: "#0F172A",
                  fontSize: 13,
                  fontWeight: 600,
                  textAlign: "right",
                  width: 64,
                }}
              >
                {formatScore(entry.score)}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #F1F5F9",
                  borderLeft: "none",
                  color: deltaColor(entry.delta),
                  fontSize: 13,
                  textAlign: "right",
                  width: 72,
                  borderRadius: "0 6px 6px 0",
                }}
              >
                {entry.delta === null ? "—" : formatDelta(entry.delta)}
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
  scoreUrl,
  webAppUrl,
}: AgentScoreWeeklyDigestEmailProps) {
  return (
    <ContainerLayout previewText={headline} footer={<EmailFooter unsubscribe={{ webAppUrl, group: "agent_score" }} />}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {headline}
      </EmailText>

      <Section className="mb-6">
        <Text style={{ margin: 0, fontSize: 44, lineHeight: "52px", fontWeight: 600, color: "#0F172A" }}>
          {formatScore(score)}
        </Text>
        <Text style={{ margin: "4px 0 0 0", fontSize: 14, color: "#475569" }}>{movement}</Text>
      </Section>

      <DimensionTable dimensions={dimensions} />

      <EmailText variant="bodySmall" className="mt-4">
        {coverage}
      </EmailText>

      <EmailText variant="bodySmall" className="mt-2">
        {projectName ? `${organizationName} / ${projectName}` : organizationName}
      </EmailText>

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
    cost: { score: 66, delta: -1.2 },
    speed: { score: 70, delta: 4.1 },
    safety: { score: 92, delta: null },
  },
  scoreUrl: "http://localhost:3000/projects/checkout-agent/agent-score?date=2026-09-21",
  webAppUrl: "http://localhost:3000",
} satisfies AgentScoreWeeklyDigestEmailProps
