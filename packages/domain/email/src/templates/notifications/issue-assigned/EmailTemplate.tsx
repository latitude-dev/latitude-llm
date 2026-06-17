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
  SectionHeader,
  SignalIdFooter,
  SignalTimestamp,
} from "../-incident-components.tsx"

interface SignalAssignedEmailProps {
  readonly signalId: string
  /** Live-resolved issue display name; falls back to neutral copy when the row is gone. */
  readonly signalName: string
  readonly description: string | undefined
  /** Live-resolved display name of the user who made the assignment. */
  readonly actorName: string
  readonly signalUrl: string | undefined
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly webAppUrl: string
}

export function SignalAssignedEmail({
  signalId,
  signalName,
  description,
  actorName,
  signalUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  webAppUrl,
}: SignalAssignedEmailProps) {
  const scope = formatScope(organizationName, projectName)

  return (
    <ContainerLayout
      previewText={`You were assigned to ${signalName}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "personal" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        You were assigned to a signal
      </EmailText>
      <EmailText variant="body">{`${actorName} assigned you to this signal in ${scope}.`}</EmailText>

      <SectionHeader label="Signal" />
      <EmailText variant="heading">{signalName}</EmailText>
      {description ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {description}
        </EmailText>
      ) : null}

      <SignalTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable rows={[{ label: "Project", value: scope }]} />

      <SignalIdFooter signalId={signalId} />

      {signalUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={signalUrl} label="View signal" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

SignalAssignedEmail.PreviewProps = {
  signalId: "dds0rt8sqgpuku4u4wabze9r",
  signalName: "Token leakage in responses",
  description: "Agent occasionally echoes API keys or PII back to the user when summarising prior tool outputs.",
  actorName: "Carlos Sansón",
  signalUrl: "https://console.latitude.so/projects/sample-project/issues/preview-issue",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Support agent",
  webAppUrl: "http://localhost:3000",
} satisfies SignalAssignedEmailProps
