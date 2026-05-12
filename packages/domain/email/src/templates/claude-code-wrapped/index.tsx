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
   * Absolute base URL (no trailing slash) where the personality PNGs live.
   * The worker derives this from `LAT_WEB_URL` so it stays correct across
   * localhost / staging / production deployments. No default — the caller
   * always knows which environment it's in.
   */
  readonly imageBaseUrl: string
}

export async function claudeCodeWrappedTemplate(data: ClaudeCodeWrappedEmailData): Promise<RenderedEmail> {
  const projectName = data.report.project.name
  return {
    html: await renderEmail(
      <ClaudeCodeWrappedEmail userName={data.userName} report={data.report} imageBaseUrl={data.imageBaseUrl} />,
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
