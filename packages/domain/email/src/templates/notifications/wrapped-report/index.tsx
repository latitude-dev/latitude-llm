import { WrappedReportId } from "@domain/shared"
import {
  CURRENT_REPORT_VERSION,
  type Report,
  type ReportVersion,
  WrappedReportRepository,
  type WrappedReportType,
} from "@domain/spans"
import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers (tsx/esbuild classic transform)
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { RenderedEmail } from "../../types.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { ClaudeCodeWrappedEmailV1 } from "./claude-code/v1/EmailTemplateV1.tsx"
import { ClaudeCodeWrappedEmailV2 } from "./claude-code/v2/EmailTemplateV2.tsx"
import { ClaudeCodeWrappedEmailV3 } from "./claude-code/v3/EmailTemplateV3.tsx"

const PLAIN_RANGE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

const formatPlainRange = (start: Date, end: Date): string =>
  `${PLAIN_RANGE_FMT.format(start)} – ${PLAIN_RANGE_FMT.format(end)}`

/**
 * Dispatch by `(type, reportVersion)` → versioned React template. Today
 * the only entry is `claude_code: { 1: ClaudeCodeWrappedEmailV1 }`. When a
 * second Wrapped type lands, add a sibling entry; when V2 of an existing
 * type ships, freeze the V1 component and add V2 alongside.
 */
const TEMPLATE_BY_TYPE_VERSION = {
  claude_code: {
    1: ClaudeCodeWrappedEmailV1,
    // Cast so the dispatcher constraint is satisfied — V2/V3 accept the same
    // runtime props as V1 (report: Report) but their PreviewProps differ.
    2: ClaudeCodeWrappedEmailV2 as unknown as typeof ClaudeCodeWrappedEmailV1,
    3: ClaudeCodeWrappedEmailV3 as unknown as typeof ClaudeCodeWrappedEmailV1,
  },
} as const satisfies Record<WrappedReportType, Record<ReportVersion, typeof ClaudeCodeWrappedEmailV1>>

interface RenderInput {
  readonly userName: string
  readonly type: WrappedReportType
  readonly report: Report
  readonly webAppUrl: string
  readonly reportId: string
  readonly reportVersion: ReportVersion
}

/**
 * Pure HTML builder. Picks a versioned React template by `(type,
 * reportVersion)` and renders to HTML + plaintext.
 *
 * V1 is rendered through the shared registry signature, so old V1 reports
 * keep their frozen output verbatim.
 */
const renderWrappedHtml = async (input: RenderInput): Promise<RenderedEmail> => {
  const projectName = input.report.project.name
  const fullReportUrl = `${input.webAppUrl.replace(/\/$/, "")}/wrapped/${input.reportId}`
  const reportIdBranded = WrappedReportId(input.reportId)
  const templatesForType = TEMPLATE_BY_TYPE_VERSION[input.type] ?? TEMPLATE_BY_TYPE_VERSION.claude_code
  const resolvedVersion: ReportVersion =
    input.reportVersion in templatesForType ? input.reportVersion : CURRENT_REPORT_VERSION
  const Template = templatesForType[resolvedVersion]
  const emailJsx =
    resolvedVersion === 3 ? (
      <ClaudeCodeWrappedEmailV3
        userName={input.userName}
        report={input.report}
        webAppUrl={input.webAppUrl}
        reportId={reportIdBranded}
      />
    ) : resolvedVersion === 2 ? (
      <ClaudeCodeWrappedEmailV2
        userName={input.userName}
        report={input.report}
        webAppUrl={input.webAppUrl}
        reportId={reportIdBranded}
      />
    ) : (
      <Template
        userName={input.userName}
        report={input.report}
        webAppUrl={input.webAppUrl}
        reportId={reportIdBranded}
      />
    )
  // V3+ carries a public skills summary; earlier versions don't.
  const skillsLine =
    "skills" in input.report && input.report.skills.totalUses > 0
      ? `\n• ${input.report.skills.distinctUsed.toLocaleString("en-US")} skills used (${input.report.skills.totalUses.toLocaleString("en-US")} uses)`
      : ""
  const baseText = `Hi ${input.userName},\n\nYour Claude Code Wrapped for ${projectName} (${formatPlainRange(
    input.report.window.start,
    input.report.window.end,
  )} UTC):\n\n• ${input.report.totals.sessions.toLocaleString("en-US")} sessions\n• ${input.report.totals.toolCalls.toLocaleString(
    "en-US",
  )} tool calls\n• ${input.report.totals.filesTouched.toLocaleString("en-US")} files touched${skillsLine}\n\nSee your full week:\n${fullReportUrl}`
  return {
    html: await renderEmail(emailJsx),
    subject: `Your Claude Code week in ${projectName}`,
    text: baseText,
  }
}

/**
 * Renderer for the `wrapped.report` notification kind. Looks up the
 * persisted `wrapped_reports` row by `payload.wrappedReportId`, then
 * delegates to the versioned React template (preserving the legacy
 * `(type, reportVersion)` dispatch invariant). The greeting uses
 * `ctx.recipient.name` — fall back to "there" when the user has no name.
 *
 * If the report row is missing (deleted between request and send), this
 * renderer fails with `RenderNotificationEmailError`. The email-send use
 * case's `markEmailed` claim already stamped the row, so a missing
 * report is a one-shot lost email — preferred over silently sending a
 * blank message.
 */
export const wrappedReportRenderer: NotificationEmailRenderer<"wrapped.report"> = (
  payload,
  ctx: NotificationEmailRenderContext,
) =>
  Effect.gen(function* () {
    const repo = yield* WrappedReportRepository
    const record = yield* repo.findById(WrappedReportId(payload.wrappedReportId)).pipe(
      Effect.mapError((cause) => ({
        _tag: "RenderNotificationEmailError" as const,
        message: `Wrapped report ${payload.wrappedReportId} not found for notification email`,
        cause,
      })),
    )
    return yield* Effect.tryPromise({
      try: () =>
        renderWrappedHtml({
          userName: ctx.recipient.name ?? "there",
          type: record.type,
          report: record.report,
          webAppUrl: ctx.webAppUrl,
          reportId: record.id,
          reportVersion: record.reportVersion,
        }),
      catch: (cause) => ({
        _tag: "RenderNotificationEmailError" as const,
        message: "Failed to render wrapped.report email",
        cause,
      }),
    })
  })

// Default export drives the React Email dev preview at /wrapped-report/index —
// keep it pointed at the current (highest) report version so the parent route
// in the preview server reflects the version users actually receive.
export default ClaudeCodeWrappedEmailV3
