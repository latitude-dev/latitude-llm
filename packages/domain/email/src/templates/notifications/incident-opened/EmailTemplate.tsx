import type { IncidentBreach } from "@domain/notifications"
import type { AlertIncidentKind } from "@domain/shared"
import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"
import { formatRatePerHour, IncidentTrendChartImage, TagsChips } from "../-incident-components.tsx"

/**
 * Sustained-side label/copy. Only `issue.escalating` reaches this
 * template today — the other entries are defensive defaults in case a
 * future kind ever produces an `incident.opened`.
 */
export const ALERT_KIND_TO_LABEL: Record<AlertIncidentKind, string> = {
  "issue.new": "New issue",
  "issue.regressed": "Regressed issue",
  "issue.escalating": "Escalating issue",
}

interface IncidentOpenedEmailProps {
  readonly userName: string
  readonly incidentKind: AlertIncidentKind
  readonly issueName: string | undefined
  readonly issueUrl: string | undefined
  readonly chartUrl: string
  readonly tags: readonly string[] | undefined
  readonly breach: IncidentBreach | undefined
}

const buildBreachLine = (breach: IncidentBreach | undefined): string | null => {
  if (!breach) return null
  const trigger = formatRatePerHour(breach.triggerRate)
  const baseline = formatRatePerHour(breach.baselineRate)
  // Avoid divide-by-zero on cold-start baselines.
  if (breach.baselineRate <= 0) {
    return `Rate climbed to ${trigger}; threshold was ${formatRatePerHour(breach.threshold)}.`
  }
  const multiplier = breach.triggerRate / breach.baselineRate
  const multiplierStr = multiplier >= 10 ? `${Math.round(multiplier)}×` : `${multiplier.toFixed(1)}×`
  return `Rate climbed to ${trigger} — ${multiplierStr} the baseline of ${baseline}.`
}

export function IncidentOpenedEmail({
  userName,
  incidentKind,
  issueName,
  issueUrl,
  chartUrl,
  tags,
  breach,
}: IncidentOpenedEmailProps) {
  const label = ALERT_KIND_TO_LABEL[incidentKind]
  const issueRef = issueName ?? "an issue"
  const breachLine = buildBreachLine(breach)

  return (
    <ContainerLayout previewText={`${label}: ${issueRef}`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {`Escalating: ${issueRef}`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {breachLine
          ? `Hi ${userName}, an issue's occurrence rate just crossed the escalation threshold.`
          : `Hi ${userName}, an issue's occurrence rate just crossed the escalation threshold.`}
      </EmailText>

      {breachLine ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {breachLine}
        </EmailText>
      ) : null}

      <IncidentTrendChartImage src={chartUrl} />

      {tags && tags.length > 0 ? <TagsChips tags={tags} /> : null}

      {issueUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={issueUrl} label="View issue" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentOpenedEmail.PreviewProps = {
  userName: "Alex",
  incidentKind: "issue.escalating",
  issueName: "Token leakage in responses",
  issueUrl: "https://console.latitude.so/projects/sample-project/issues?issueId=preview-issue",
  chartUrl: "https://placehold.co/600x200/dbe5ff/3b5bff?text=Trend+chart",
  tags: ["env:prod", "service:agents", "model:claude-3.5-sonnet"],
  breach: { triggerRate: 12.5, baselineRate: 4.2, threshold: 7 },
} satisfies IncidentOpenedEmailProps
