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

interface SignalRegressedEmailProps {
  readonly signalId: string
  readonly signalName: string
  readonly description: string | undefined
  readonly signalUrl: string | undefined
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly webAppUrl: string
}

export function SignalRegressedEmail({
  signalId,
  signalName,
  description,
  signalUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  webAppUrl,
}: SignalRegressedEmailProps) {
  const scope = formatScope(organizationName, projectName)

  return (
    <ContainerLayout
      previewText={`Signal regressed: ${signalName}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "incidents" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        A resolved signal came back
      </EmailText>
      <EmailText variant="body">{`This signal was marked as resolved in ${scope}, but a new occurrence just matched it. It has been reopened.`}</EmailText>

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

SignalRegressedEmail.PreviewProps = {
  signalId: "dds0rt8sqgpuku4u4wabze9r",
  signalName: "Assistant leaks internal prompts",
  description:
    "The assistant reveals parts of its system prompt when users ask indirect questions about its instructions.",
  signalUrl: "https://console.latitude.so/projects/sample-project/signals/preview-signal",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Flaggers",
  webAppUrl: "http://localhost:3000",
} satisfies SignalRegressedEmailProps
