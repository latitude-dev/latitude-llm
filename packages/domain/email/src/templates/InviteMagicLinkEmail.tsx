import { Section } from "@react-email/components"
import { ContainerLayout } from "../components/ContainerLayout.js"
import { EmailButton } from "../components/EmailButton.js"
import { EmailText } from "../components/EmailText.js"
import { emailDesignTokens } from "../tokens/design-system.js"

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
