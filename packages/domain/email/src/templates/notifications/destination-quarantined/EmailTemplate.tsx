import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailFooter } from "../../../components/EmailFooter.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface DestinationQuarantinedEmailProps {
  readonly destinationName: string
  readonly scope: string
  readonly failureMessage: string | undefined
  readonly settingsUrl: string | undefined
  readonly webAppUrl: string
}

export function DestinationQuarantinedEmail({
  destinationName,
  scope,
  failureMessage,
  settingsUrl,
  webAppUrl,
}: DestinationQuarantinedEmailProps) {
  const title = `Data destination "${destinationName}" stopped syncing`
  return (
    <ContainerLayout previewText={title} footer={<EmailFooter unsubscribe={{ webAppUrl, group: "destinations" }} />}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {title}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`${destinationName} in ${scope} was quarantined after repeated delivery failures and is no longer exporting data. Update the API key or host to reconnect it.`}
      </EmailText>
      {failureMessage ? (
        <EmailText variant="bodySmall" className={emailDesignTokens.spacing.contentGap}>
          {`Last error: ${failureMessage}`}
        </EmailText>
      ) : null}

      {settingsUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={settingsUrl} label="Open data destinations" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

DestinationQuarantinedEmail.PreviewProps = {
  destinationName: "Production PostHog",
  scope: "Acme Inc. / checkout-agent",
  failureMessage: "[401] invalid_api_key",
  settingsUrl: "http://localhost:3000/projects/checkout-agent/settings/data-destinations/dst_example",
  webAppUrl: "http://localhost:3000",
} satisfies DestinationQuarantinedEmailProps
