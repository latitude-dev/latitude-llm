import { Section } from "@react-email/components"
import { ContainerLayout } from "../components/ContainerLayout.js"
import { EmailButton } from "../components/EmailButton.js"
import { EmailText } from "../components/EmailText.js"
import { emailDesignTokens } from "../tokens/design-system.js"

interface SignupExistingAccountMagicLinkEmailProps {
  readonly userName: string
  readonly magicLinkUrl: string
}

export function SignupExistingAccountMagicLinkEmail({
  userName,
  magicLinkUrl,
}: SignupExistingAccountMagicLinkEmailProps) {
  return (
    <ContainerLayout previewText="Sign in to your existing Latitude account">
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>{`Hi ${userName},`}</EmailText>
      <EmailText variant="body" className="mb-2">
        Looks like this email is already registered in Latitude.
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        Use this secure link to sign in to your existing account.
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={magicLinkUrl} label="Sign In To Latitude" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        This link will expire in 1 hour and can only be used once.
      </EmailText>
    </ContainerLayout>
  )
}
