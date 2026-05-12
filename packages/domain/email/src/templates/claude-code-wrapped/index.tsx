import type { Report } from "@domain/spans"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers (tsx/esbuild classic transform)
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { ClaudeCodeWrappedEmail } from "./EmailTemplate.tsx"

const PLAIN_RANGE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

const formatPlainRange = (start: Date, end: Date): string =>
  `${PLAIN_RANGE_FMT.format(start)} – ${PLAIN_RANGE_FMT.format(end)}`

export interface ClaudeCodeWrappedEmailData {
  readonly userName: string
  readonly report: Report
  /**
   * Public base URL of the web app (no trailing slash). The template derives
   * every downstream link from this — personality PNGs, project deep-link,
   * unsubscribe / settings page, Latitude logo. Worker passes the value of
   * `LAT_WEB_URL` so it follows the deployment.
   */
  readonly webAppUrl: string
}

export async function claudeCodeWrappedTemplate(data: ClaudeCodeWrappedEmailData): Promise<RenderedEmail> {
  const projectName = data.report.project.name
  return {
    html: await renderEmail(
      <ClaudeCodeWrappedEmail userName={data.userName} report={data.report} webAppUrl={data.webAppUrl} />,
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
