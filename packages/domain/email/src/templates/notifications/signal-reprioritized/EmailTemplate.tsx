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
  PriorityBadge,
  SectionHeader,
  SignalIdFooter,
  SignalTimestamp,
} from "../-incident-components.tsx"

/** Only increases notify, so there is one headline; a first priority is a raise from nothing. */
export const SIGNAL_REPRIORITIZED_HEADING = "Signal priority raised"

interface SignalReprioritizedEmailProps {
  readonly signalId: string
  readonly signalName: string
  readonly description: string | undefined
  readonly priority: SignalPriority
  readonly previousPriority: SignalPriority | null
  readonly actorName: string
  readonly signalUrl: string | undefined
  readonly notificationCreatedAt: Date
  readonly organizationName: string
  readonly projectName: string | undefined
  readonly webAppUrl: string
}

function PreviousPriorityValue({ priority }: { readonly priority: SignalPriority | null }) {
  if (!priority) {
    return <span style={{ color: "#64748B", fontSize: 13 }}>None</span>
  }
  return <PriorityBadge priority={priority} />
}

export function SignalReprioritizedEmail({
  signalId,
  signalName,
  description,
  priority,
  previousPriority,
  actorName,
  signalUrl,
  notificationCreatedAt,
  organizationName,
  projectName,
  webAppUrl,
}: SignalReprioritizedEmailProps) {
  const scope = formatScope(organizationName, projectName)

  return (
    <ContainerLayout
      previewText={`${SIGNAL_REPRIORITIZED_HEADING}: ${signalName}`}
      footer={<EmailFooter unsubscribe={{ webAppUrl, group: "signals" }} />}
    >
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {SIGNAL_REPRIORITIZED_HEADING}
      </EmailText>
      <EmailText variant="body">{`${actorName} raised the priority of this signal in ${scope}.`}</EmailText>

      <SectionHeader label="Signal" />
      <EmailText variant="heading">{signalName}</EmailText>
      {description ? (
        <EmailText variant="bodySmall" className="text-muted-foreground">
          {description}
        </EmailText>
      ) : null}

      <SignalTimestamp timestamp={notificationCreatedAt} />

      <EmailMetadataTable
        rows={[
          {
            label: "Priority",
            value: (
              <span>
                <PreviousPriorityValue priority={previousPriority} />
                <span style={{ color: "#64748B", fontSize: 13, padding: "0 8px" }}>&rarr;</span>
                <PriorityBadge priority={priority} />
              </span>
            ),
          },
          { label: "Raised by", value: actorName },
          { label: "Project", value: scope },
        ]}
      />

      <SignalIdFooter signalId={signalId} />

      {signalUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={signalUrl} label="View signal" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

SignalReprioritizedEmail.PreviewProps = {
  signalId: "dds0rt8sqgpuku4u4wabze9r",
  signalName: "Assistant leaks internal prompts",
  description:
    "The assistant reveals parts of its system prompt when users ask indirect questions about its instructions.",
  priority: "urgent",
  previousPriority: "medium",
  actorName: "Anna Ruiz",
  signalUrl: "https://console.latitude.so/projects/sample-project/signals/preview-signal",
  notificationCreatedAt: new Date("2026-03-18T10:05:00Z"),
  organizationName: "Acme Inc.",
  projectName: "Flaggers",
  webAppUrl: "http://localhost:3000",
} satisfies SignalReprioritizedEmailProps
