import type { WrappedReportId } from "@domain/shared"
import { CURRENT_REPORT_VERSION, type Report, type ReportVersion, type WrappedReportType } from "@domain/spans"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers (tsx/esbuild classic transform)
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { ClaudeCodeWrappedEmailV1 } from "./claude-code/v1/EmailTemplateV1.tsx"

const PLAIN_RANGE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

const formatPlainRange = (start: Date, end: Date): string =>
  `${PLAIN_RANGE_FMT.format(start)} – ${PLAIN_RANGE_FMT.format(end)}`

export interface WrappedEmailData {
  readonly userName: string
  /** Which Wrapped type the email represents — picks the template family. */
  readonly type: WrappedReportType
  readonly report: Report
  /**
   * Public base URL of the web app (no trailing slash). The template derives
   * personality PNG URLs, project deep-link, unsubscribe / settings page,
   * Latitude logo, and the full-report URL from it. Worker passes
   * `LAT_WEB_URL`.
   */
  readonly webAppUrl: string
  /** Persisted report id; the CTA links to `${webAppUrl}/wrapped/${reportId}`. */
  readonly reportId: WrappedReportId
  /**
   * Optional override for the schema version of `report`. Defaults to
   * `CURRENT_REPORT_VERSION`. Pass an older value to render an older
   * stored row with its frozen template (the renderer dispatch picks the
   * V1 / V2 / … React tree based on this).
   */
  readonly reportVersion?: ReportVersion
}

/**
 * Dispatch by `(type, reportVersion)` → versioned React template. Today
 * the only entry is `claude_code: { 1: ClaudeCodeWrappedEmailV1 }`. When a
 * second Wrapped type lands, add a sibling entry; when V2 of an existing
 * type ships, freeze the V1 component and add V2 alongside.
 */
const TEMPLATE_BY_TYPE_VERSION = {
  claude_code: { 1: ClaudeCodeWrappedEmailV1 },
} as const satisfies Record<WrappedReportType, Record<ReportVersion, typeof ClaudeCodeWrappedEmailV1>>

export async function wrappedEmailTemplate(data: WrappedEmailData): Promise<RenderedEmail> {
  const projectName = data.report.project.name
  const fullReportUrl = `${data.webAppUrl.replace(/\/$/, "")}/wrapped/${data.reportId}`
  const version = data.reportVersion ?? CURRENT_REPORT_VERSION
  const templatesForType = TEMPLATE_BY_TYPE_VERSION[data.type] ?? TEMPLATE_BY_TYPE_VERSION.claude_code
  const Template = templatesForType[version] ?? templatesForType[CURRENT_REPORT_VERSION]
  return {
    html: await renderEmail(
      <Template userName={data.userName} report={data.report} webAppUrl={data.webAppUrl} reportId={data.reportId} />,
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
