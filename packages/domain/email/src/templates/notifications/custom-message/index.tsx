import { Effect } from "effect"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")

const buildCustomMessageHtml = async (
  payload: Parameters<NotificationEmailRenderer<"custom.message">>[0],
  ctx: NotificationEmailRenderContext,
) => {
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

export const customMessageRenderer: NotificationEmailRenderer<"custom.message"> = (payload, ctx) =>
  Effect.tryPromise({
    try: () => buildCustomMessageHtml(payload, ctx),
    catch: (cause) => ({
      _tag: "RenderNotificationEmailError" as const,
      message: "Failed to render custom.message email",
      cause,
    }),
  })
