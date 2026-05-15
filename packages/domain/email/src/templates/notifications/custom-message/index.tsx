import type { NotificationEmailRenderer } from "../types.ts"

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

/**
 * Catch-all `custom.message` notification template. The payload's
 * `title` becomes the subject; `content` (optional) is the body. Step 5
 * polishes the layout.
 */
export const customMessageTemplate: NotificationEmailRenderer<"custom.message"> = async (payload, ctx) => {
  const recipient = ctx.recipient.name ?? "there"
  const body = payload.content ?? ""
  const link = payload.link
    ? payload.link.startsWith("http")
      ? payload.link
      : `${ctx.webAppUrl}${payload.link}`
    : undefined
  const subject = `[Latitude] ${payload.title}`
  const text = `Hi ${recipient},\n\n${body}${link ? `\n\n${link}` : ""}\n\n— Latitude`
  const html = `<p>Hi ${escapeHtml(recipient)},</p>${body ? `<p>${escapeHtml(body)}</p>` : ""}${link ? `<p><a href="${link}">Open</a></p>` : ""}<p>— Latitude</p>`
  return { subject, html, text }
}
