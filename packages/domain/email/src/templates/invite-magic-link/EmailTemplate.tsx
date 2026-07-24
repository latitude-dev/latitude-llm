import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../components/ContainerLayout.tsx"
import { EmailButton } from "../../components/EmailButton.tsx"
import { EmailText } from "../../components/EmailText.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"

interface InviteMagicLinkEmailProps {
  readonly inviterName: string
  readonly organizationName: string
  readonly magicLinkUrl: string
}

export function InviteMagicLinkEmail({ inviterName, organizationName, magicLinkUrl }: InviteMagicLinkEmailProps) {
  return (
    <ContainerLayout previewText={`${inviterName} wants you to join ${organizationName} on Latitude`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {`You have been invited to ${organizationName}`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`${inviterName} invited you to collaborate in the ${organizationName} organization on Latitude, the open-source AI agent monitoring platform.`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        Tap the button below to join the team.
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={magicLinkUrl} label="Join the Organization" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        For security, this link is valid for 1 hour and works only once.
      </EmailText>
    </ContainerLayout>
  )
}

InviteMagicLinkEmail.PreviewProps = {
  inviterName: "Jordan",
  organizationName: "Acme",
  magicLinkUrl: "https://console.latitude.so/invite/accept?token=invite-preview",
} satisfies InviteMagicLinkEmailProps
