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
    <ContainerLayout previewText={`${inviterName} invited you to join ${organizationName} on Latitude`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        You&apos;ve been invited
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`${inviterName} has invited you to join the ${organizationName} workspace on Latitude, an LLM observability platform for monitoring and evaluating AI applications.`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        Click the button below to accept the invitation and join the workspace.
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={magicLinkUrl} label="Accept Invitation" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        This link will expire in 1 hour and can only be used once.
      </EmailText>
    </ContainerLayout>
  )
}

InviteMagicLinkEmail.PreviewProps = {
  inviterName: "Jordan",
  organizationName: "Acme",
  magicLinkUrl: "https://app.latitude.so/invite/accept?token=invite-preview",
} satisfies InviteMagicLinkEmailProps

export default InviteMagicLinkEmail
