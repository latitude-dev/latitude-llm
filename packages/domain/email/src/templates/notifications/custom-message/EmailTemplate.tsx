import { Section } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../../components/ContainerLayout.tsx"
import { EmailButton } from "../../../components/EmailButton.tsx"
import { EmailText } from "../../../components/EmailText.tsx"
import { emailDesignTokens } from "../../../tokens/design-system.ts"

interface CustomMessageEmailProps {
  readonly userName: string
  readonly title: string
  readonly content: string | undefined
  readonly linkUrl: string | undefined
}

export function CustomMessageEmail({ userName, title, content, linkUrl }: CustomMessageEmailProps) {
  return (
    <ContainerLayout previewText={title}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {title}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {content ?? `Hi ${userName},`}
      </EmailText>

      {linkUrl ? (
        <Section className={emailDesignTokens.spacing.buttonTop}>
          <EmailButton href={linkUrl} label="Open" />
        </Section>
      ) : null}
    </ContainerLayout>
  )
}

CustomMessageEmail.PreviewProps = {
  userName: "Alex",
  title: "We've added new evaluation templates",
  content:
    "Hi Alex, we just shipped three new evaluation templates for tool-calling agents. Take a look at the templates page when you have a minute.",
  linkUrl: "https://console.latitude.so/evaluations",
} satisfies CustomMessageEmailProps
