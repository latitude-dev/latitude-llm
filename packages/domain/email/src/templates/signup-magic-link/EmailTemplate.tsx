import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../components/ContainerLayout.tsx"
import { EmailButton } from "../../components/EmailButton.tsx"
import { EmailText } from "../../components/EmailText.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"

interface SignupMagicLinkEmailProps {
  readonly userName: string
  readonly magicLinkUrl: string
}

function SignupMagicLinkEmail({ userName, magicLinkUrl }: SignupMagicLinkEmailProps) {
  return (
    <ContainerLayout previewText="Complete your Latitude account">
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>{`Hi ${userName},`}</EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        You&apos;re almost there. Use this link to finish creating your Latitude account and set up your workspace.
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={magicLinkUrl} label="Continue to Latitude" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        This link will expire in 1 hour and can only be used once.
      </EmailText>
    </ContainerLayout>
  )
}

SignupMagicLinkEmail.PreviewProps = {
  userName: "Alex",
  magicLinkUrl: "https://app.latitude.so/api/auth/magic-link/verify?token=signup-preview",
} satisfies SignupMagicLinkEmailProps

export default SignupMagicLinkEmail
