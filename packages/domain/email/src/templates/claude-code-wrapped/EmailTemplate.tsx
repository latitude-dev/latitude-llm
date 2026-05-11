// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { ContainerLayout } from "../../components/ContainerLayout.tsx"
import { EmailText } from "../../components/EmailText.tsx"
import { emailDesignTokens } from "../../tokens/design-system.ts"

interface ClaudeCodeWrappedEmailProps {
  readonly userName: string
  readonly projectName: string
  readonly windowStart: Date
  readonly windowEnd: Date
  readonly totalSessions: number
}

const FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

const formatRange = (start: Date, end: Date): string => `${FORMATTER.format(start)} – ${FORMATTER.format(end)}`

export function ClaudeCodeWrappedEmail({
  userName,
  projectName,
  windowStart,
  windowEnd,
  totalSessions,
}: ClaudeCodeWrappedEmailProps) {
  return (
    <ContainerLayout previewText={`${userName}, here's your Claude Code week in ${projectName}`}>
      <EmailText variant="heading" className={emailDesignTokens.spacing.headingGap}>
        {`Hi ${userName}, your Claude Code week in review`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`Here's a quick recap of how Claude Code worked alongside you on ${projectName} between ${formatRange(
          windowStart,
          windowEnd,
        )}.`}
      </EmailText>
      <EmailText variant="body" className={emailDesignTokens.spacing.contentGap}>
        {`${totalSessions.toLocaleString("en-US")} ${
          totalSessions === 1 ? "Claude Code session" : "Claude Code sessions"
        } this week.`}
      </EmailText>
      <EmailText variant="bodySmall" className={`text-muted-foreground ${emailDesignTokens.spacing.footnoteTop}`}>
        More insights — top files, your most-used tools, your chronotype — are coming soon. We&apos;re sending this
        recap because your organization has Claude Code Wrapped enabled in Latitude.
      </EmailText>
    </ContainerLayout>
  )
}

ClaudeCodeWrappedEmail.PreviewProps = {
  userName: "Alex",
  projectName: "poncho-ios",
  windowStart: new Date("2026-05-04T00:00:00.000Z"),
  windowEnd: new Date("2026-05-11T00:00:00.000Z"),
  totalSessions: 17,
} satisfies ClaudeCodeWrappedEmailProps
