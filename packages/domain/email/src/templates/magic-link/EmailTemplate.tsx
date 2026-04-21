import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../components/ContainerLayout.tsx"
import { EmailButton } from "../../components/EmailButton.tsx"
import { EmailText } from "../../components/EmailText.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"

interface MagicLinkEmailProps {
  readonly userName: string
  readonly magicLinkUrl: string
}

export function MagicLinkEmail({ userName, magicLinkUrl }: MagicLinkEmailProps) {
  return (
    <ContainerLayout previewText={`Hi ${userName}, sign in to Latitude`}>
      <EmailText
        variant="heading"
        className={emailDesignTokens.spacing.headingGap}
      >{`Welcome back, ${userName}`}</EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        We received a sign-in request for your account. Tap the button below to continue to your Latitude dashboard.
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={magicLinkUrl} label="Sign In to Latitude" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        For security, this link is valid for 1 hour and works only once. If you didn&apos;t request this, you can safely
        ignore this email.
      </EmailText>
    </ContainerLayout>
  )
}

MagicLinkEmail.PreviewProps = {
  userName: "Alex",
  magicLinkUrl: "https://app.latitude.so/auth/verify?token=magic-link-preview",
} satisfies MagicLinkEmailProps
