import { Effect } from "effect"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"

const ALERT_KIND_TO_LABEL = {
  "issue.new": "New issue",
  "issue.regressed": "Regressed issue",
  "issue.escalating": "Escalating issue",
} as const

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

const buildIncidentClosedHtml = async (
  payload: Parameters<NotificationEmailRenderer<"incident.closed">>[0],
  ctx: NotificationEmailRenderContext,
) => {
  const label = ALERT_KIND_TO_LABEL[payload.incidentKind] ?? payload.incidentKind
  const issueRef = payload.issueName ?? "an issue"
  const recipient = ctx.recipient.name ?? "there"
  const linkPath =
    payload.projectSlug && payload.issueId ? `/projects/${payload.projectSlug}/issues/${payload.issueId}` : "/projects"
  const link = `${ctx.webAppUrl}${linkPath}`
  const subject = `[Latitude] ${label} resolved: ${issueRef}`
  const text = `Hi ${recipient},\n\n${label} resolved for "${issueRef}".\n\n${link}\n\n— Latitude`
  const html = `<p>Hi ${escapeHtml(recipient)},</p><p>${escapeHtml(label)} resolved for "<strong>${escapeHtml(issueRef)}</strong>".</p><p><a href="${link}">View issue</a></p><p>— Latitude</p>`
  return { subject, html, text }
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
