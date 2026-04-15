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

export function SignupMagicLinkEmail({ userName, magicLinkUrl }: SignupMagicLinkEmailProps) {
  return (
    <ContainerLayout previewText={`Hi ${userName}, confirm your email to get started`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>{`Hey ${userName}, let's get you set up`}</EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        Thanks for signing up for Latitude. Confirm your email address by tapping the button below, and we&apos;ll have your workspace ready in seconds.
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={magicLinkUrl} label="Confirm and Get Started" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        For security, this link is valid for 1 hour and works only once.
      </EmailText>
    </ContainerLayout>
  )
}

SignupMagicLinkEmail.PreviewProps = {
  userName: "Alex",
  magicLinkUrl: "https://app.latitude.so/api/auth/magic-link/verify?token=signup-preview",
} satisfies SignupMagicLinkEmailProps

export default SignupMagicLinkEmail
