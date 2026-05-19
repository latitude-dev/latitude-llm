import type { IncidentSampleExcerpt } from "@domain/notifications"
import type { AlertIncidentKind, AlertSeverity } from "@domain/shared"
import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"
import {
  EmailMetadataTable,
  formatScope,
  IssueIdFooter,
  IssueTimestamp,
  SampleExcerptCard,
  SectionHeader,
  SeverityBadge,
  TagsChips,
} from "../-incident-components.tsx"

const ALERT_KIND_TO_HEADING: Record<AlertIncidentKind, string> = {
  "issue.new": "New issue",
  "issue.regressed": "Regressed issue",
  "issue.escalating": "Escalating issue",
}

const ALERT_KIND_TO_SUBTITLE: Record<AlertIncidentKind, string> = {
  "issue.new": "We notified everyone watching this project of the new issue.",
  "issue.regressed": "We notified everyone watching this project — this issue had previously been resolved.",
  "issue.escalating":
    "We notified everyone watching this project — the issue's occurrence rate crossed the escalation threshold.",
}

interface IncidentEventEmailProps {
  readonly incidentKind: AlertIncidentKind
  readonly severity: AlertSeverity
  readonly issueId: string
  readonly issueName: string | undefined
  readonly issueDescription: string | undefined
  readonly issueUrl: string | undefined
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly tags: readonly string[] | undefined
  readonly sampleExcerpt: IncidentSampleExcerpt | undefined
}

export function IncidentEventEmail({
  incidentKind,
  severity,
  issueId,
  issueName,
  issueDescription,
  issueUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  tags,
  sampleExcerpt,
}: IncidentEventEmailProps) {
  const heading = ALERT_KIND_TO_HEADING[incidentKind]
  const subtitle = ALERT_KIND_TO_SUBTITLE[incidentKind]
  const issueRef = issueName ?? "an issue"
  const scope = formatScope(organizationName, projectName)

  const metadataRows = [
    { label: "Project", value: scope },
    { label: "Severity", value: <SeverityBadge severity={severity} /> },
    ...(tags && tags.length > 0 ? [{ label: "Tags", value: <TagsChips tags={tags} /> }] : []),
  ]

  return (
    <ContainerLayout previewText={`${heading}: ${issueRef}`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {heading}
      </EmailText>
      <EmailText variant="body">{subtitle}</EmailText>

      <SectionHeader label="Issue" />

      <EmailText variant="heading">{issueRef}</EmailText>
      {issueDescription ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {issueDescription}
        </EmailText>
      ) : null}

      <IssueTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable rows={metadataRows} />

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

IncidentEventEmail.PreviewProps = {
  incidentKind: "issue.new",
  severity: "medium",
  issueId: "dds0rt8sqgpuku4u4wabze9r",
  issueName: "Token leakage in responses",
  issueDescription: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
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
} satisfies IncidentEventEmailProps
