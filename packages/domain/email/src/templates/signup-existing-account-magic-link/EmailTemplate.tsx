import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../components/ContainerLayout.tsx"
import { EmailButton } from "../../components/EmailButton.tsx"
import { EmailText } from "../../components/EmailText.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"

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

SignupExistingAccountMagicLinkEmail.PreviewProps = {
  userName: "Alex",
  magicLinkUrl: "https://app.latitude.so/auth/verify?token=signup-existing-preview",
} satisfies SignupExistingAccountMagicLinkEmailProps

export default SignupExistingAccountMagicLinkEmail
