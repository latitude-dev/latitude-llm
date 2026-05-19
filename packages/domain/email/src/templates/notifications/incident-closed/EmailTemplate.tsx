import type { IncidentRecovery } from "@domain/notifications"
import type { AlertIncidentKind } from "@domain/shared"
import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"
import { humanizeDurationMs, IncidentTrendChartImage } from "../-incident-components.tsx"

interface IncidentClosedEmailProps {
  readonly userName: string
  readonly incidentKind: AlertIncidentKind
  readonly issueName: string | undefined
  readonly issueUrl: string | undefined
  readonly chartUrl: string
  readonly recovery: IncidentRecovery
}

export function IncidentClosedEmail({ userName, issueName, issueUrl, chartUrl, recovery }: IncidentClosedEmailProps) {
  const issueRef = issueName ?? "an issue"
  const duration = humanizeDurationMs(recovery.durationMs)

  return (
    <ContainerLayout previewText={`Resolved: escalation on ${issueRef}`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {`Resolved: escalation on ${issueRef}`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`Hi ${userName}, the occurrence rate has returned to baseline.`}
      </EmailText>

      <EmailText variant="bodySmall" className="text-muted-foreground">
        {`Elevated for ${duration} — no further action needed unless the issue regresses again.`}
      </EmailText>

      <IncidentTrendChartImage src={chartUrl} />

      {issueUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={issueUrl} label="View issue" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

IncidentClosedEmail.PreviewProps = {
  userName: "Alex",
  incidentKind: "issue.escalating",
  issueName: "Token leakage in responses",
  issueUrl: "https://console.latitude.so/projects/sample-project/issues?issueId=preview-issue",
  chartUrl: "https://placehold.co/600x200/dbe5ff/3b5bff?text=Trend+chart",
  recovery: { durationMs: 32 * 60 * 1000 },
} satisfies IncidentClosedEmailProps
