import type { IncidentSampleExcerpt } from "@domain/notifications"
import type { AlertIncidentKind } from "@domain/shared"
import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"
import { SampleExcerptCard, TagsChips } from "../-incident-components.tsx"

/**
 * Per-alert-kind copy for one-shot incidents (`incident.event`). Only
 * `issue.new` and `issue.regressed` reach this template today since
 * `issue.escalating` is a sustained kind routed through
 * `incident.opened` / `incident.closed`.
 */
export const ALERT_KIND_TO_LABEL: Record<AlertIncidentKind, string> = {
  "issue.new": "New issue",
  "issue.regressed": "Regressed issue",
  "issue.escalating": "Escalating issue",
}

const ALERT_KIND_TO_DESCRIPTION: Record<AlertIncidentKind, string> = {
  "issue.new": "An issue was just detected for the first time in this project.",
  "issue.regressed": "A previously-resolved issue is producing occurrences again.",
  "issue.escalating": "An issue's occurrence rate crossed the escalation threshold.",
}

interface IncidentEventEmailProps {
  readonly userName: string
  readonly incidentKind: AlertIncidentKind
  readonly issueName: string | undefined
  readonly issueUrl: string | undefined
  readonly tags: readonly string[] | undefined
  readonly sampleExcerpt: IncidentSampleExcerpt | undefined
}

export function IncidentEventEmail({
  userName,
  incidentKind,
  issueName,
  issueUrl,
  tags,
  sampleExcerpt,
}: IncidentEventEmailProps) {
  const label = ALERT_KIND_TO_LABEL[incidentKind]
  const description = ALERT_KIND_TO_DESCRIPTION[incidentKind]
  const issueRef = issueName ?? "an issue"

  return (
    <ContainerLayout previewText={`${label}: ${issueRef}`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {`${label}: ${issueRef}`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`Hi ${userName}, ${description}`}
      </EmailText>

      {tags && tags.length > 0 ? <TagsChips tags={tags} /> : null}
      {sampleExcerpt ? <SampleExcerptCard excerpt={sampleExcerpt} /> : null}

      {issueUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={issueUrl} label="View issue" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentEventEmail.PreviewProps = {
  userName: "Alex",
  incidentKind: "issue.new",
  issueName: "Token leakage in responses",
  issueUrl: "https://console.latitude.so/projects/sample-project/issues?issueId=preview-issue",
  tags: ["env:prod", "model:claude-3.5-sonnet", "service:agents"],
  sampleExcerpt: {
    source: "annotation",
    text: "Reviewer flagged a tool-call loop after the third retry — model kept invoking `search` with the same query.",
    truncated: false,
  },
} satisfies IncidentEventEmailProps
