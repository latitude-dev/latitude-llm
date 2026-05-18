import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { CustomMessageEmail } from "./EmailTemplate.tsx"

/**
 * Resolves a payload link to an absolute URL. Bare paths (`/projects/...`)
 * are prefixed with `ctx.webAppUrl`; already-absolute links are passed
 * through.
 */
const resolveLinkUrl = (
  ctx: NotificationEmailRenderContext,
  link: string | undefined,
): string | undefined => {
  if (!link) return undefined
  return link.startsWith("http") ? link : `${ctx.webAppUrl}${link}`
}

const buildCustomMessageHtml = async (
  payload: Parameters<NotificationEmailRenderer<"custom.message">>[0],
  ctx: NotificationEmailRenderContext,
) => {
  const userName = ctx.recipient.name ?? "there"
  const linkUrl = resolveLinkUrl(ctx, payload.link)
  const html = await renderEmail(
    <CustomMessageEmail
      userName={userName}
      title={payload.title}
      content={payload.content}
      linkUrl={linkUrl}
    />,
  )
  return {
    html,
    subject: `[Latitude] ${payload.title}`,
    text: `Hi ${userName},\n\n${payload.content ?? payload.title}${linkUrl ? `\n\n${linkUrl}` : ""}\n\n— Latitude`,
  }
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
