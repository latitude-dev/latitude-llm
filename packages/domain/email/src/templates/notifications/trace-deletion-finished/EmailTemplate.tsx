import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailFooter } from "../../../components/EmailFooter.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface TraceDeletionFinishedEmailProps {
  readonly title: string
  readonly body: string
  readonly historyUrl: string | undefined
  readonly webAppUrl: string
}

export function TraceDeletionFinishedEmail({ title, body, historyUrl, webAppUrl }: TraceDeletionFinishedEmailProps) {
  return (
    <ContainerLayout previewText={title} footer={<EmailFooter unsubscribe={{ webAppUrl, group: "personal" }} />}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {title}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {body}
      </EmailText>
      {historyUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={historyUrl} label="View deletion history" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

TraceDeletionFinishedEmail.PreviewProps = {
  title: "Your trace deletion finished",
  body: "1,204 traces were permanently deleted from Acme Inc. / checkout-agent, with their spans, scores and search indexes.",
  historyUrl: "http://localhost:3000/projects/checkout-agent/settings/data-deletion",
  webAppUrl: "http://localhost:3000",
} satisfies TraceDeletionFinishedEmailProps
