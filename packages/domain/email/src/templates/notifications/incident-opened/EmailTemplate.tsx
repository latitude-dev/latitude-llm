import type { AlertIncidentKind } from "@domain/shared"
import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

/**
 * Per-alert-kind copy. Mirrors the labels the project-level settings page
 * uses so users see the same vocabulary on the toggle as on the email.
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

interface IncidentOpenedEmailProps {
  readonly userName: string
  readonly incidentKind: AlertIncidentKind
  readonly issueName: string | undefined
  readonly issueUrl: string | undefined
}

export function IncidentOpenedEmail({ userName, incidentKind, issueName, issueUrl }: IncidentOpenedEmailProps) {
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
} satisfies IncidentOpenedEmailProps
