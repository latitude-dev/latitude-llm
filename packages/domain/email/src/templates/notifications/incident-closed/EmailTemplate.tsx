import type { IncidentRecovery } from "@domain/notifications"
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
  formatScope,
  humanizeDurationMs,
  IncidentTrendChartImage,
  IssueIdFooter,
  IssueTimestamp,
  MonitorAttribution,
  type MonitorAttributionInfo,
  SectionHeader,
  SeverityBadge,
} from "../-incident-components.tsx"

interface IncidentClosedEmailProps {
  readonly severity: AlertSeverity
  readonly issueId: string
  readonly issueName: string | undefined
  readonly issueDescription: string | undefined
  readonly issueUrl: string | undefined
  readonly chartUrl: string
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly recovery: IncidentRecovery
  readonly monitor: MonitorAttributionInfo | undefined
  readonly webAppUrl: string
}

export function IncidentClosedEmail({
  severity,
  issueId,
  issueName,
  issueDescription,
  issueUrl,
  chartUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  recovery,
  monitor,
  webAppUrl,
}: IncidentClosedEmailProps) {
  const issueRef = issueName ?? "an issue"
  const scope = formatScope(organizationName, projectName)
  const duration = humanizeDurationMs(recovery.durationMs)

  const metadataRows = [
    { label: "Project", value: scope },
    { label: "Severity", value: <SeverityBadge severity={severity} /> },
  ]

  return (
    <ContainerLayout
      previewText={`Resolved: escalation on ${issueRef}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "incidents" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        Resolved escalation
      </EmailText>
      <EmailText variant="body">
        We notified everyone watching this project — the occurrence rate has returned to baseline.
      </EmailText>

      <MonitorAttribution monitor={monitor} />

      <SectionHeader label="Issue" />

      <EmailText variant="heading">{issueRef}</EmailText>
      {issueDescription ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {issueDescription}
        </EmailText>
      ) : null}

      <IssueTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable rows={metadataRows} />

      <SectionHeader label="Recovery" />
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`Elevated for ${duration} — no further action needed unless the issue regresses again.`}
      </EmailText>
      <IncidentTrendChartImage src={chartUrl} />

      <IssueIdFooter issueId={issueId} />

      {issueUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={issueUrl} label="View issue" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentClosedEmail.PreviewProps = {
  severity: "high",
  issueId: "dds0rt8sqgpuku4u4wabze9r",
  issueName: "Token leakage in responses",
  issueDescription: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
  issueUrl: "https://console.latitude.so/projects/sample-project/issues?issueId=preview-issue",
  chartUrl: "https://placehold.co/600x200/dbe5ff/3b5bff?text=Trend+chart",
  notificationCreatedAt: new Date("2026-03-18T10:37:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Support agent",
  recovery: { durationMs: 32 * 60 * 1000 },
  monitor: {
    name: "Issue escalating",
    url: "https://console.latitude.so/projects/sample-project/monitors?monitorSlug=issue-escalating",
    conditionSummary: "Alerts when an ongoing issue is being detected more than expected.",
  },
  webAppUrl: "http://localhost:3000",
} satisfies IncidentClosedEmailProps
