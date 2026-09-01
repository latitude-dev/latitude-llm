import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailFooter } from "../../../components/EmailFooter.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface BillingLimitReachedEmailProps {
  readonly organizationName: string
  readonly title: string
  readonly body: string
  readonly billingUrl: string
  readonly webAppUrl: string
}

export function BillingLimitReachedEmail({
  organizationName,
  title,
  body,
  billingUrl,
  webAppUrl,
}: BillingLimitReachedEmailProps) {
  return (
    <ContainerLayout previewText={title} footer={<EmailFooter unsubscribe={{ webAppUrl, group: "billing" }} />}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {title}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {body}
      </EmailText>
      <EmailText variant="bodySmall" className={emailDesignTokens.spacing.contentGap}>
        {`Organization: ${organizationName}`}
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={billingUrl} label="Open billing settings" />
      </Section>
    </ContainerLayout>
  )
}

BillingLimitReachedEmail.PreviewProps = {
  organizationName: "Acme Inc.",
  title: "Your plan credit limit has been reached",
  body: "Acme Inc. has used all 20,000 credits included in its Free plan for this billing period. Upgrade your plan or wait for the period to reset to continue ingesting traces and running AI features.",
  billingUrl: "http://localhost:3000/settings/billing",
  webAppUrl: "http://localhost:3000",
} satisfies BillingLimitReachedEmailProps
