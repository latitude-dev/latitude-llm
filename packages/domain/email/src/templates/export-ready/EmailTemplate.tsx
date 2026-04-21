import { Section } from "@react-email/components"
// React import required at runtime for JSX in workers (no automatic runtime).
// @ts-expect-error TS6133 - unused in this file but needed when transpiled for workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../components/ContainerLayout.tsx"
import { EmailButton } from "../../components/EmailButton.tsx"
import { EmailText } from "../../components/EmailText.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"

interface ExportReadyEmailProps {
  readonly exportName: string
  readonly downloadUrl: string
  readonly recipientName?: string
}

export function ExportReadyEmail({ exportName, downloadUrl, recipientName = "there" }: ExportReadyEmailProps) {
  return (
    <ContainerLayout previewText={`Your "${exportName}" export is ready`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>{`Hi ${recipientName},`}</EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`Good news — your "${exportName}" export has been generated and is ready for download.`}
      </EmailText>

      <Section className={emailDesignTokens.spacing.buttonTop}>
        <EmailButton href={downloadUrl} label="Download Your Export" />
      </Section>

      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        This download link will remain active for 7 days.
      </EmailText>
    </ContainerLayout>
  )
}

ExportReadyEmail.PreviewProps = {
  exportName: "Project Traces",
  downloadUrl: "https://app.latitude.so/downloads/export-abc123",
  recipientName: "Alex",
} satisfies ExportReadyEmailProps
