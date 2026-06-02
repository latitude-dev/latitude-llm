import type { IncidentBreach, IncidentSampleExcerpt } from "@domain/notifications"
import type { AlertSeverity } from "@domain/shared"
import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailFooter } from "../../../components/EmailFooter.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"
import {
  EmailMetadataTable,
  formatRatePerHour,
  formatScope,
  IncidentTrendChartImage,
  IssueIdFooter,
  IssueTimestamp,
  SampleExcerptCard,
  SectionHeader,
  SeverityBadge,
  TagsChips,
} from "../-incident-components.tsx"

interface IncidentOpenedEmailProps {
  readonly severity: AlertSeverity
  readonly issueId: string
  readonly issueName: string | undefined
  readonly issueDescription: string | undefined
  readonly issueUrl: string | undefined
  readonly chartUrl: string
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly tags: readonly string[] | undefined
  readonly breach: IncidentBreach | undefined
  readonly sampleExcerpt: IncidentSampleExcerpt | undefined
  readonly webAppUrl: string
}

const buildBreachLine = (breach: IncidentBreach | undefined): string | null => {
  if (!breach) return null
  const trigger = formatRatePerHour(breach.triggerRate)
  const baseline = formatRatePerHour(breach.baselineRate)
  if (breach.baselineRate <= 0) {
    return `Rate climbed to ${trigger}; threshold was ${formatRatePerHour(breach.threshold)}.`
  }
  const multiplier = breach.triggerRate / breach.baselineRate
  const multiplierStr = multiplier >= 10 ? `${Math.round(multiplier)}×` : `${multiplier.toFixed(1)}×`
  return `Rate climbed to ${trigger} — ${multiplierStr} the baseline of ${baseline}.`
}

export function IncidentOpenedEmail({
  severity,
  issueId,
  issueName,
  issueDescription,
  issueUrl,
  chartUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  tags,
  breach,
  sampleExcerpt,
  webAppUrl,
}: IncidentOpenedEmailProps) {
  const issueRef = issueName ?? "an issue"
  const scope = formatScope(organizationName, projectName)
  const breachLine = buildBreachLine(breach)

  const metadataRows = [
    { label: "Project", value: scope },
    { label: "Severity", value: <SeverityBadge severity={severity} /> },
    ...(tags && tags.length > 0 ? [{ label: "Tags", value: <TagsChips tags={tags} /> }] : []),
  ]

  return (
    <ContainerLayout
      previewText={`Escalating: ${issueRef}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "incidents" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        Issue escalating
      </EmailText>
      <EmailText variant="body">
        We notified everyone watching this project — an ongoing issue is being detected more than expected.
      </EmailText>

      <SectionHeader label="Issue" />

      <EmailText variant="heading">{issueRef}</EmailText>
      {issueDescription ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {issueDescription}
        </EmailText>
      ) : null}

      <IssueTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable rows={metadataRows} />

      <SectionHeader label="Breach" />
      {breachLine ? (
        <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
          {breachLine}
        </EmailText>
      ) : null}
      <IncidentTrendChartImage src={chartUrl} />

      {sampleExcerpt ? <SampleExcerptCard excerpt={sampleExcerpt} /> : null}

      <IssueIdFooter issueId={issueId} />

      {issueUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={issueUrl} label="View issue" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentOpenedEmail.PreviewProps = {
  severity: "high",
  issueId: "dds0rt8sqgpuku4u4wabze9r",
  issueName: "Token leakage in responses",
  issueDescription: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
  issueUrl: "https://console.latitude.so/projects/sample-project/issues?issueId=preview-issue",
  chartUrl: "https://placehold.co/600x200/dbe5ff/3b5bff?text=Trend+chart",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Support agent",
  tags: ["env:prod", "service:agents", "model:claude-3.5-sonnet"],
  breach: { triggerRate: 12.5, baselineRate: 4.2, threshold: 7 },
  sampleExcerpt: {
    text: "Response mentioned the customer's competitor when summarising the warranty terms.",
    truncated: false,
    author: { kind: "evaluation", name: "warranty-judge" },
  },
  webAppUrl: "http://localhost:3000",
} satisfies IncidentOpenedEmailProps
