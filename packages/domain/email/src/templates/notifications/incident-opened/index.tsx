import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { ALERT_KIND_TO_LABEL, IncidentOpenedEmail } from "./EmailTemplate.tsx"

/**
 * Mirrors the in-app `buildIssueUrl` (see
 * `apps/web/src/routes/_authenticated/-components/notifications/renderers/incident/-incident-helpers.ts`).
 * Returns `undefined` when the payload snapshot is missing slug/issue id,
 * in which case the email omits the CTA rather than linking to a broken
 * path.
 */
const buildIssueUrl = (
  ctx: NotificationEmailRenderContext,
  payload: Parameters<NotificationEmailRenderer<"incident.opened">>[0],
): string | undefined => {
  if (!payload.projectSlug || !payload.issueId) return undefined
  return `${ctx.webAppUrl}/projects/${payload.projectSlug}/issues?issueId=${encodeURIComponent(payload.issueId)}`
}

const buildIncidentOpenedHtml = async (
  payload: Parameters<NotificationEmailRenderer<"incident.opened">>[0],
  ctx: NotificationEmailRenderContext,
) => {
  const userName = ctx.recipient.name ?? "there"
  const label = ALERT_KIND_TO_LABEL[payload.incidentKind]
  const issueRef = payload.issueName ?? "an issue"
  const issueUrl = buildIssueUrl(ctx, payload)
  const html = await renderEmail(
    <IncidentOpenedEmail
      userName={userName}
      incidentKind={payload.incidentKind}
      issueName={payload.issueName}
      issueUrl={issueUrl}
    />,
  )
  return {
    html,
    subject: `[Latitude] ${label}: ${issueRef}`,
    text: `Hi ${userName},\n\n${label}: ${issueRef}.${issueUrl ? `\n\n${issueUrl}` : ""}\n\n— Latitude`,
  }
}

export const incidentOpenedRenderer: NotificationEmailRenderer<"incident.opened"> = (payload, ctx) =>
  Effect.tryPromise({
    try: () => buildIncidentOpenedHtml(payload, ctx),
    catch: (cause) => ({
      _tag: "RenderNotificationEmailError" as const,
      message: "Failed to render incident.opened email",
      cause,
    }),
  })

export default IncidentOpenedEmail
