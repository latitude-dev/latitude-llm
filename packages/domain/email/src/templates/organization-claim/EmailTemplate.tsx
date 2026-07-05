import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../components/ContainerLayout.tsx"
import { EmailButton } from "../../components/EmailButton.tsx"
import { EmailText } from "../../components/EmailText.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"

interface OrganizationClaimEmailProps {
  readonly claimUrl: string
  readonly organizationName: string
  readonly expiresAtLabel: string
}

export function OrganizationClaimEmail({ claimUrl, organizationName, expiresAtLabel }: OrganizationClaimEmailProps) {
  return (
    <ContainerLayout previewText={`Claim ${organizationName} on Latitude`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {`Claim ${organizationName} on Latitude`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`Your new ${organizationName} organization has been set up for you on Latitude, the open-source AI Agent Monitoring platform. Claim it before ${expiresAtLabel} to capture Agent trajectories, discover behavior patterns, and catch issues before your users do!`}
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={claimUrl} label="Claim your Organization" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        {`If you didn't set this up, you can ignore this email, temporary organizations are automatically deleted.`}
      </EmailText>
    </ContainerLayout>
  )
}

OrganizationClaimEmail.PreviewProps = {
  claimUrl: "https://console.latitude.so/claim/claim-token-preview",
  organizationName: "Acme",
  expiresAtLabel: "July 10, 2026",
} satisfies OrganizationClaimEmailProps
