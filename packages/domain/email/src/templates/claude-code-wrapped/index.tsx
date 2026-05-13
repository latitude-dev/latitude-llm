import type { Report } from "@domain/spans"
import type { WrappedReportId } from "@domain/shared"
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
   * unsubscribe / settings page, Latitude logo, and the public report URL
   * the "See your full week →" CTA points at. Worker passes `LAT_WEB_URL`.
   */
  readonly webAppUrl: string
  /**
   * Persisted report id — the email teaser links to `${webAppUrl}/cc-wrapped/${reportId}`
   * for the full report.
   */
  readonly reportId: WrappedReportId
}

export async function claudeCodeWrappedTemplate(data: ClaudeCodeWrappedEmailData): Promise<RenderedEmail> {
  const projectName = data.report.project.name
  const fullReportUrl = `${data.webAppUrl.replace(/\/$/, "")}/cc-wrapped/${data.reportId}`
  return {
    html: await renderEmail(
      <ClaudeCodeWrappedEmail
        userName={data.userName}
        report={data.report}
        webAppUrl={data.webAppUrl}
        reportId={data.reportId}
      />,
    ),
    subject: `Your Claude Code week in ${projectName}`,
    text: `Hi ${data.userName},\n\nYour Claude Code Wrapped for ${projectName} (${formatPlainRange(
      data.report.window.start,
      data.report.window.end,
    )} UTC):\n\n• ${data.report.totals.sessions.toLocaleString("en-US")} sessions\n• ${data.report.totals.toolCalls.toLocaleString(
      "en-US",
    )} tool calls\n• ${data.report.totals.filesTouched.toLocaleString("en-US")} files touched\n\nSee your full week:\n${fullReportUrl}`,
  }
}
