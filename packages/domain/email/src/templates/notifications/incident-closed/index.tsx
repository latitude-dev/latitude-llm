import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { ALERT_KIND_TO_LABEL, IncidentClosedEmail } from "./EmailTemplate.tsx"

const buildIssueUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.closed">>[0],
): string | undefined => {
  if (!payload.projectSlug || !payload.issueId) return undefined
  return `${ctx.webAppUrl}/projects/${payload.projectSlug}/issues?issueId=${encodeURIComponent(payload.issueId)}`
}

const buildIncidentClosedHtml = async (
  payload: Parameters<NotificationEmailRenderer<"incident.closed">>[0],
  ctx: NotificationEmailRenderContext,
) => {
  const userName = ctx.recipient.name ?? "there"
  const label = ALERT_KIND_TO_LABEL[payload.incidentKind]
  const issueRef = payload.issueName ?? "an issue"
  const issueUrl = buildIssueUrl(ctx, payload)
  const html = await renderEmail(
    <IncidentClosedEmail
      userName={userName}
      incidentKind={payload.incidentKind}
      issueName={payload.issueName}
      issueUrl={issueUrl}
    />,
  )
  return {
    html,
    subject: `[Latitude] ${label} resolved: ${issueRef}`,
    text: `Hi ${userName},\n\n${label} resolved: ${issueRef}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
  }
}

export const incidentClosedRenderer: NotificationEmailRenderer<"incident.closed"> = (payload, ctx) =>
  Effect.tryPromise({
    try: () => buildIncidentClosedHtml(payload, ctx),
    catch: (cause) => ({
      _tag: "RenderNotificationEmailError" as const,
      message: "Failed to render incident.closed email",
      cause,
    }),
  })
