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

interface SignalDiscoveredEmailProps {
  readonly signalId: string
  readonly signalName: string
  readonly description: string | undefined
  readonly signalUrl: string | undefined
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly webAppUrl: string
}

export function SignalDiscoveredEmail({
  signalId,
  signalName,
  description,
  signalUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  webAppUrl,
}: SignalDiscoveredEmailProps) {
  const scope = formatScope(organizationName, projectName)

  return (
    <ContainerLayout
      previewText={`Signal discovered: ${signalName}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "signals" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        New signal discovered
      </EmailText>
      <EmailText variant="body">{`Latitude discovered this signal in ${scope}.`}</EmailText>

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

SignalDiscoveredEmail.PreviewProps = {
  signalId: "dds0rt8sqgpuku4u4wabze9r",
  signalName: "Long-running sessions (2x average)",
  description:
    "Sessions whose duration is at least twice a reasonable baseline average. The project shows many sessions with zero-recorded duration; this threshold targets the outliers that record meaningful time.",
  signalUrl: "https://console.latitude.so/projects/sample-project/signals/preview-signal",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Flaggers",
  webAppUrl: "http://localhost:3000",
} satisfies SignalDiscoveredEmailProps
