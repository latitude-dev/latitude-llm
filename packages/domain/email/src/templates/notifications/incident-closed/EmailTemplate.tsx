import type { IncidentRecovery } from "@domain/notifications"
import { ALERT_INCIDENT_KIND_SOURCE_TYPE, type AlertIncidentKind, type AlertSeverity } from "@domain/shared"
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
  readonly incidentKind: AlertIncidentKind
  readonly severity: AlertSeverity
  readonly sourceId: string
  readonly sourceName: string
  readonly description: string | undefined
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
  incidentKind,
  severity,
  sourceId,
  sourceName,
  description,
  issueUrl,
  chartUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  recovery,
  monitor,
  webAppUrl,
}: IncidentClosedEmailProps) {
  const isSavedSearch = ALERT_INCIDENT_KIND_SOURCE_TYPE[incidentKind] === "savedSearch"
  const heading = "Resolved escalation"
  const subtitle = isSavedSearch
    ? "We notified everyone watching this project — matching traces have returned below the threshold."
    : "We notified everyone watching this project — the occurrence rate has returned to baseline."
  const scope = formatScope(organizationName, projectName)
  const duration = humanizeDurationMs(recovery.durationMs)
  const recoveryLine = isSavedSearch
    ? `Elevated for ${duration} — no further action needed unless matching traces climb again.`
    : `Elevated for ${duration} — no further action needed unless the issue regresses again.`
  const ctaHref = isSavedSearch ? monitor?.url : issueUrl

  const metadataRows = [
    { label: "Project", value: scope },
    { label: "Severity", value: <SeverityBadge severity={severity} /> },
  ]

  return (
    <ContainerLayout
      previewText={`Resolved: escalation on ${sourceName}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "incidents" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {heading}
      </EmailText>
      <EmailText variant="body">{subtitle}</EmailText>

      <MonitorAttribution monitor={monitor} />

      <SectionHeader label={isSavedSearch ? "Saved search" : "Issue"} />
      <EmailText variant="heading">{sourceName}</EmailText>
      {description ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {description}
        </EmailText>
      ) : null}

      <IssueTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable rows={metadataRows} />

      <SectionHeader label="Recovery" />
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {recoveryLine}
      </EmailText>
      {isSavedSearch ? null : (
        <>
          <IncidentTrendChartImage src={chartUrl} />
          <IssueIdFooter issueId={sourceId} />
        </>
      )}

      {ctaHref ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={ctaHref} label={isSavedSearch ? "View monitor" : "View issue"} />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentClosedEmail.PreviewProps = {
  incidentKind: "issue.escalating",
  severity: "high",
  sourceId: "dds0rt8sqgpuku4u4wabze9r",
  sourceName: "Token leakage in responses",
  description: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
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
