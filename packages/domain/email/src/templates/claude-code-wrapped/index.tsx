import type { Report } from "@domain/spans"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers (tsx/esbuild classic transform)
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { ClaudeCodeWrappedEmail } from "./EmailTemplate.tsx"

const DEFAULT_IMAGE_BASE_URL = "https://console.latitude.so/email-branding/claude-code-wrapped/personalities"

const PLAIN_RANGE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

const formatPlainRange = (start: Date, end: Date): string =>
  `${PLAIN_RANGE_FMT.format(start)} – ${PLAIN_RANGE_FMT.format(end)}`

export interface ClaudeCodeWrappedEmailData {
  readonly userName: string
  readonly report: Report
  /** Optional override; defaults to the production console.latitude.so URL. */
  readonly imageBaseUrl?: string
}

export async function claudeCodeWrappedTemplate(data: ClaudeCodeWrappedEmailData): Promise<RenderedEmail> {
  const imageBaseUrl = data.imageBaseUrl ?? DEFAULT_IMAGE_BASE_URL
  const projectName = data.report.project.name
  return {
    html: await renderEmail(
      <ClaudeCodeWrappedEmail userName={data.userName} report={data.report} imageBaseUrl={imageBaseUrl} />,
    ),
    subject: `Your Claude Code week in ${projectName}`,
    text: `Hi ${data.userName},\n\nYour Claude Code Wrapped for ${projectName} (${formatPlainRange(
      data.report.window.start,
      data.report.window.end,
    )} UTC):\n\n• ${data.report.totals.sessions.toLocaleString("en-US")} sessions\n• ${data.report.totals.toolCalls.toLocaleString(
      "en-US",
    )} tool calls\n• ${data.report.totals.filesTouched.toLocaleString("en-US")} files touched\n\nOpen the HTML version for the full breakdown — including your archetype reveal.`,
  }
}
