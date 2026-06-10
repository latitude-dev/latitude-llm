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
  SectionHeader,
} from "../-incident-components.tsx"

interface IssueAssignedEmailProps {
  readonly issueId: string
  /** Live-resolved issue display name; falls back to neutral copy when the row is gone. */
  readonly issueName: string
  readonly description: string | undefined
  /** Live-resolved display name of the user who made the assignment. */
  readonly actorName: string
  readonly issueUrl: string | undefined
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly webAppUrl: string
}

export function IssueAssignedEmail({
  issueId,
  issueName,
  description,
  actorName,
  issueUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  webAppUrl,
}: IssueAssignedEmailProps) {
  const scope = formatScope(organizationName, projectName)

  return (
    <ContainerLayout
      previewText={`You were assigned to ${issueName}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "personal" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        You were assigned to an issue
      </EmailText>
      <EmailText variant="body">{`${actorName} assigned you to this issue in ${scope}.`}</EmailText>

      <SectionHeader label="Issue" />
      <EmailText variant="heading">{issueName}</EmailText>
      {description ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {description}
        </EmailText>
      ) : null}

      <IssueTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable rows={[{ label: "Project", value: scope }]} />

      <IssueIdFooter issueId={issueId} />

      {issueUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={issueUrl} label="View issue" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IssueAssignedEmail.PreviewProps = {
  issueId: "dds0rt8sqgpuku4u4wabze9r",
  issueName: "Token leakage in responses",
  description: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
  actorName: "Carlos Sansón",
  issueUrl: "https://console.latitude.so/projects/sample-project/issues/preview-issue",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Support agent",
  webAppUrl: "http://localhost:3000",
} satisfies IssueAssignedEmailProps
