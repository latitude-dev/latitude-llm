import type { NotificationEmailRenderer } from "../types.ts"

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/**
 * Teaser email for the `wrapped.report` notification kind. The detailed
 * Wrapped report email is still sent by the wrapped worker via its own
 * pipeline; this is the notification-system surface (driven by the bell
 * + email-prefs flow). Step 5 polishes the layout; deduplication with
 * the existing wrapped email is a known follow-up.
 */
export const wrappedReportTemplate: NotificationEmailRenderer<"wrapped.report"> = async (payload, ctx) => {
  const recipient = ctx.recipient.name ?? "there"
  const link = payload.link.startsWith("http") ? payload.link : `${ctx.webAppUrl}${payload.link}`
  const subject = `[Latitude] Your Wrapped report for ${payload.projectName} is ready`
  const text = `Hi ${recipient},\n\nYour Wrapped report for ${payload.projectName} is ready.\n\n${link}\n\n— Latitude`
  const html = `<p>Hi ${escapeHtml(recipient)},</p><p>Your Wrapped report for "<strong>${escapeHtml(payload.projectName)}</strong>" is ready.</p><p><a href="${link}">View report</a></p><p>— Latitude</p>`
  return { subject, html, text }
}
