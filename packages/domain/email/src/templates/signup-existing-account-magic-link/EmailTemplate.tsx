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
    <ContainerLayout previewText={`Hi ${userName}, you already have a Latitude account`}>
      <EmailText
        variant="heading"
        className={emailDesignTokens.spacing.headingGap}
      >{`Welcome back, ${userName}`}</EmailText>
      <EmailText variant="body" className="mb-2">
        It looks like you tried to create a new account, but this email address is already linked to an existing
        Latitude workspace.
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        No worries — just tap the button below to sign in directly.
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={magicLinkUrl} label="Sign In to Your Account" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        For security, this link is valid for 1 hour and works only once. If you didn&apos;t request this, you can safely
        ignore this email.
      </EmailText>
    </ContainerLayout>
  )
}

SignupExistingAccountMagicLinkEmail.PreviewProps = {
  userName: "Alex",
  magicLinkUrl: "https://app.latitude.so/auth/verify?token=signup-existing-preview",
} satisfies SignupExistingAccountMagicLinkEmailProps