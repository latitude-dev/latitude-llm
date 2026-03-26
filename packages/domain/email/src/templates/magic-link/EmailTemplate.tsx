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

function MagicLinkEmail({ userName, magicLinkUrl }: MagicLinkEmailProps) {
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

MagicLinkEmail.PreviewProps = {
  userName: "Alex",
  magicLinkUrl: "https://app.latitude.so/auth/verify?token=magic-link-preview",
} satisfies MagicLinkEmailProps

export default MagicLinkEmail
