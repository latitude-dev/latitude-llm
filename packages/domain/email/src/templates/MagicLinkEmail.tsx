import { Section } from "@react-email/components"
import { ContainerLayout } from "../components/ContainerLayout.js"
import { EmailButton } from "../components/EmailButton.js"
import { EmailText } from "../components/EmailText.js"
import { emailDesignTokens } from "../tokens/design-system.js"

interface MagicLinkEmailProps {
  readonly userName: string
  readonly magicLinkUrl: string
}

export function MagicLinkEmail({ userName, magicLinkUrl }: MagicLinkEmailProps) {
  return (
    <ContainerLayout previewText="Log in with this magic link">
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>{`Hi ${userName},`}</EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        Here&apos;s your magic link to access Latitude.
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={magicLinkUrl} label="Access Latitude" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        This link will expire in 1 hour and can only be used once.
      </EmailText>
    </ContainerLayout>
  )
}
