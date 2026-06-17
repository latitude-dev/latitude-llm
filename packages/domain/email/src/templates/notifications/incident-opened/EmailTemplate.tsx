import type { IncidentBreach, IncidentSampleExcerpt } from "@domain/notifications"
import {
  ALERT_INCIDENT_KIND_LABEL,
  ALERT_INCIDENT_KIND_SOURCE_TYPE,
  type AlertIncidentKind,
  type AlertSeverity,
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
  formatRatePerHour,
  formatScope,
  IncidentTrendChartImage,
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

interface IncidentOpenedEmailProps {
  readonly incidentKind: AlertIncidentKind
  readonly severity: AlertSeverity
  readonly sourceId: string
  readonly sourceName: string
  readonly description: string | undefined
  readonly signalUrl: string | undefined
  readonly chartUrl: string
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  /** Signal triage snapshot at incident time; absent on legacy payloads and saved-search sources. */
  readonly priority: SignalPriority | undefined
  /** Live-resolved assignee display name; absent when unassigned or unresolvable. */
  readonly assigneeName: string | undefined
  readonly tags: readonly string[] | undefined
  readonly breach: IncidentBreach | undefined
  readonly sampleExcerpt: IncidentSampleExcerpt | undefined
  readonly monitor: MonitorAttributionInfo | undefined
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
  incidentKind,
  severity,
  sourceId,
  sourceName,
  description,
  signalUrl,
  chartUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  priority,
  assigneeName,
  tags,
  breach,
  sampleExcerpt,
  monitor,
  webAppUrl,
}: IncidentOpenedEmailProps) {
  const isSavedSearch = ALERT_INCIDENT_KIND_SOURCE_TYPE[incidentKind] === "savedSearch"
  const heading = ALERT_INCIDENT_KIND_LABEL[incidentKind]
  const subtitle = isSavedSearch
    ? "We notified everyone watching this project — traces matching the search stayed above the threshold for the configured window."
    : "We notified everyone watching this project — an ongoing signal is being detected more than expected."
  const scope = formatScope(organizationName, projectName)
  const breachLine = buildBreachLine(breach)
  const ctaHref = isSavedSearch ? monitor?.url : signalUrl

  const metadataRows = [
    { label: "Project", value: scope },
    { label: "Severity", value: <SeverityBadge severity={severity} /> },
    ...(priority ? [{ label: "Priority", value: <PriorityBadge priority={priority} /> }] : []),
    ...(assigneeName ? [{ label: "Assigned to", value: assigneeName }] : []),
    ...(tags && tags.length > 0 ? [{ label: "Tags", value: <TagsChips tags={tags} /> }] : []),
  ]

  return (
    <ContainerLayout
      previewText={`Escalating: ${sourceName}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "incidents" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {heading}
      </EmailText>
      <EmailText variant="body">{subtitle}</EmailText>

      <MonitorAttribution monitor={monitor} />

      <SectionHeader label={isSavedSearch ? "Saved search" : "Signal"} />
      <EmailText variant="heading">{sourceName}</EmailText>
      {description ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {description}
        </EmailText>
      ) : null}

      <SignalTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable rows={metadataRows} />

      {isSavedSearch ? null : (
        <>
          <SectionHeader label="Breach" />
          {breachLine ? (
            <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
              {breachLine}
            </EmailText>
          ) : null}
          <IncidentTrendChartImage src={chartUrl} />
          {sampleExcerpt ? <SampleExcerptCard excerpt={sampleExcerpt} /> : null}
          <SignalIdFooter signalId={sourceId} />
        </>
      )}

      {ctaHref ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={ctaHref} label={isSavedSearch ? "View monitor" : "View signal"} />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentOpenedEmail.PreviewProps = {
  incidentKind: "issue.escalating",
  severity: "high",
  sourceId: "dds0rt8sqgpuku4u4wabze9r",
  sourceName: "Token leakage in responses",
  description: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
  signalUrl: "https://console.latitude.so/projects/sample-project/issues/preview-issue",
  chartUrl: "https://placehold.co/600x200/dbe5ff/3b5bff?text=Trend+chart",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Support agent",
  priority: "urgent",
  assigneeName: "Anna Bosch",
  tags: ["env:prod", "service:agents", "model:claude-3.5-sonnet"],
  breach: { triggerRate: 12.5, baselineRate: 4.2, threshold: 7 },
  sampleExcerpt: {
    text: "Response mentioned the customer's competitor when summarising the warranty terms.",
    truncated: false,
    author: { kind: "evaluation", name: "warranty-judge" },
  },
  monitor: {
    name: "Signal escalating",
    url: "https://console.latitude.so/projects/sample-project/monitors?monitorSlug=issue-escalating",
    conditionSummary: "Opens an incident when an ongoing signal is being detected more than expected.",
  },
  webAppUrl: "http://localhost:3000",
} satisfies IncidentOpenedEmailProps
