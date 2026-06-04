import type { IncidentSampleExcerpt } from "@domain/notifications"
import {
  ALERT_INCIDENT_KIND_LABEL,
  ALERT_INCIDENT_KIND_SOURCE_TYPE,
  type AlertIncidentKind,
  type AlertSeverity,
} from "@domain/shared"
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
  IssueIdFooter,
  IssueTimestamp,
  MonitorAttribution,
  type MonitorAttributionInfo,
  SampleExcerptCard,
  SectionHeader,
  SeverityBadge,
  TagsChips,
} from "../-incident-components.tsx"

const ALERT_KIND_TO_SUBTITLE: Record<AlertIncidentKind, string> = {
  "issue.new": "We notified everyone watching this project — a new issue was discovered.",
  "issue.regressed": "We notified everyone watching this project — a resolved issue was detected again.",
  "issue.escalating":
    "We notified everyone watching this project — an ongoing issue is being detected more than expected.",
  "savedSearch.match": "We notified everyone watching this project — a new trace matching the search was detected.",
  "savedSearch.threshold":
    "We notified everyone watching this project — traces matching the search were detected above the configured threshold.",
  "savedSearch.escalating":
    "We notified everyone watching this project — traces matching the search stayed above the threshold for the configured window.",
}

interface IncidentEventEmailProps {
  readonly incidentKind: AlertIncidentKind
  readonly severity: AlertSeverity
  /** Source entity id — issue id or saved search id. Surfaced in the footer for issues only. */
  readonly sourceId: string
  /** Live-resolved source display name (issue title or saved search name). */
  readonly sourceName: string
  /** Issue description; absent for saved-search sources. */
  readonly description: string | undefined
  readonly issueUrl: string | undefined
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly tags: readonly string[] | undefined
  readonly sampleExcerpt: IncidentSampleExcerpt | undefined
  readonly monitor: MonitorAttributionInfo | undefined
  readonly webAppUrl: string
}

export function IncidentEventEmail({
  incidentKind,
  severity,
  sourceId,
  sourceName,
  description,
  issueUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  tags,
  sampleExcerpt,
  monitor,
  webAppUrl,
}: IncidentEventEmailProps) {
  const heading = ALERT_INCIDENT_KIND_LABEL[incidentKind]
  const subtitle = ALERT_KIND_TO_SUBTITLE[incidentKind]
  const isSavedSearch = ALERT_INCIDENT_KIND_SOURCE_TYPE[incidentKind] === "savedSearch"
  const scope = formatScope(organizationName, projectName)
  const ctaHref = isSavedSearch ? monitor?.url : issueUrl

  const metadataRows = [
    { label: "Project", value: scope },
    { label: "Severity", value: <SeverityBadge severity={severity} /> },
    ...(tags && tags.length > 0 ? [{ label: "Tags", value: <TagsChips tags={tags} /> }] : []),
  ]

  return (
    <ContainerLayout
      previewText={`${heading}: ${sourceName}`}
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

      {sampleExcerpt ? <SampleExcerptCard excerpt={sampleExcerpt} /> : null}

      {isSavedSearch ? null : <IssueIdFooter issueId={sourceId} />}

      {ctaHref ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={ctaHref} label={isSavedSearch ? "View monitor" : "View issue"} />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentEventEmail.PreviewProps = {
  incidentKind: "issue.new",
  severity: "medium",
  sourceId: "dds0rt8sqgpuku4u4wabze9r",
  sourceName: "Token leakage in responses",
  description: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
  issueUrl: "https://console.latitude.so/projects/sample-project/issues?issueId=preview-issue",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Support agent",
  tags: ["env:prod", "model:claude-3.5-sonnet", "service:agents"],
  sampleExcerpt: {
    text: "Reviewer flagged a tool-call loop after the third retry — model kept invoking `search` with the same query.",
    truncated: false,
    author: { kind: "user", name: "Anna Bosch", imageUrl: null },
  },
  monitor: {
    name: "Issue discovered",
    url: "https://console.latitude.so/projects/sample-project/monitors?monitorSlug=issue-discovered",
  },
  webAppUrl: "http://localhost:3000",
} satisfies IncidentEventEmailProps
