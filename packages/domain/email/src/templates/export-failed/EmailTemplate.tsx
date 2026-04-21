import { Section } from "@react-email/components"
// React import required at runtime for JSX in workers (no automatic runtime).
// @ts-expect-error TS6133 - unused in this file but needed when transpiled for workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../components/ContainerLayout.tsx"
import { EmailText } from "../../components/EmailText.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"

interface ExportFailedEmailProps {
  readonly exportName: string
  readonly recipientName?: string
}

export function ExportFailedEmail({ exportName, recipientName = "there" }: ExportFailedEmailProps) {
  return (
    <ContainerLayout previewText={`Your "${exportName}" export could not be completed`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>{`Hi ${recipientName},`}</EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`We couldn't complete your "${exportName}" export.`}
      </EmailText>

      <Section className={emailDesignTokens.spacing.contentGap}>
        <EmailText variant="body">
          Please try the export again from Latitude. If it keeps failing, reply to this email or contact support and
          we&apos;ll investigate.
        </EmailText>
      </Section>
    </ContainerLayout>
  )
}

ExportFailedEmail.PreviewProps = {
  exportName: "Project Traces",
  recipientName: "Alex",
} satisfies ExportFailedEmailProps
