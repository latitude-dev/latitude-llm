import type { IncidentSampleExcerpt } from "@domain/notifications"
import {
  type AlertSeverity,
  GROUP_FOR_INCIDENT_NOTIFICATION_KEY,
  INCIDENT_NOTIFICATION_KEY_LABEL,
  type IncidentNotificationKey,
} from "@domain/shared"
import type { SignalPriority } from "@domain/signals"
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
  MonitorAttribution,
  type MonitorAttributionInfo,
  PriorityBadge,
  SampleExcerptCard,
  SectionHeader,
  SeverityBadge,
  SignalIdFooter,
  SignalTimestamp,
  TagsChips,
} from "../-incident-components.tsx"

const ALERT_KIND_TO_SUBTITLE: Record<IncidentNotificationKey, string> = {
  "signal.escalating":
    "We notified everyone watching this project. A signal is being detected more often than expected.",
  "monitor.match": "We notified everyone watching this project. A new match came in.",
  "monitor.threshold": "We notified everyone watching this project. A monitored metric crossed its threshold.",
  "monitor.escalating":
    "We notified everyone watching this project. A monitored metric stayed over its threshold for the configured window.",
}

interface IncidentEventEmailProps {
  readonly incidentKind: IncidentNotificationKey
  readonly severity: AlertSeverity
  /** Source entity id — issue id or saved search id. Surfaced in the footer for issues only. */
  readonly sourceId: string
  /** Live-resolved source display name (issue title or saved search name). */
  readonly sourceName: string
  /** Signal description; absent for monitor sources. */
  readonly description: string | undefined
  readonly signalUrl: string | undefined
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  /** Signal triage snapshot at incident time; absent on legacy payloads and monitor sources. */
  readonly priority: SignalPriority | undefined
  /** Live-resolved assignee display name; absent when unassigned or unresolvable. */
  readonly assigneeName: string | undefined
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
  signalUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  priority,
  assigneeName,
  tags,
  sampleExcerpt,
  monitor,
  webAppUrl,
}: IncidentEventEmailProps) {
  const heading = INCIDENT_NOTIFICATION_KEY_LABEL[incidentKind]
  const subtitle = ALERT_KIND_TO_SUBTITLE[incidentKind]
  const isMonitorIncident = incidentKind.startsWith("monitor.")
  const scope = formatScope(organizationName, projectName)
  const ctaHref = isMonitorIncident ? monitor?.url : signalUrl

  const metadataRows = [
    { label: "Project", value: scope },
    { label: "Severity", value: <SeverityBadge severity={severity} /> },
    ...(priority ? [{ label: "Priority", value: <PriorityBadge priority={priority} /> }] : []),
    ...(assigneeName ? [{ label: "Assigned to", value: assigneeName }] : []),
    ...(tags && tags.length > 0 ? [{ label: "Tags", value: <TagsChips tags={tags} /> }] : []),
  ]

  return (
    <ContainerLayout
      previewText={`${heading}: ${sourceName}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: GROUP_FOR_INCIDENT_NOTIFICATION_KEY[incidentKind] }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {heading}
      </EmailText>
      <EmailText variant="body">{subtitle}</EmailText>

      <MonitorAttribution monitor={monitor} />

      <SectionHeader label={isMonitorIncident ? "Monitor target" : "Signal"} />
      <EmailText variant="heading">{sourceName}</EmailText>
      {description ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {description}
        </EmailText>
      ) : null}

      <SignalTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable rows={metadataRows} />

      {sampleExcerpt ? <SampleExcerptCard excerpt={sampleExcerpt} /> : null}

      {isMonitorIncident ? null : <SignalIdFooter signalId={sourceId} />}

      {ctaHref ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={ctaHref} label={isMonitorIncident ? "View monitor" : "View signal"} />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentEventEmail.PreviewProps = {
  incidentKind: "signal.escalating",
  severity: "medium",
  sourceId: "dds0rt8sqgpuku4u4wabze9r",
  sourceName: "Token leakage in responses",
  description: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
  signalUrl: "https://console.latitude.so/projects/sample-project/issues/preview-issue",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Support agent",
  priority: "high",
  assigneeName: "Anna Bosch",
  tags: ["env:prod", "model:claude-3.5-sonnet", "service:agents"],
  sampleExcerpt: {
    text: "Reviewer flagged a tool-call loop after the third retry. The model kept calling `search` with the same query.",
    truncated: false,
    author: { kind: "user", name: "Anna Bosch", imageUrl: null },
  },
  monitor: {
    name: "Signal discovered",
    url: "https://console.latitude.so/projects/sample-project/monitors?monitorSlug=issue-discovered",
  },
  webAppUrl: "http://localhost:3000",
} satisfies IncidentEventEmailProps
