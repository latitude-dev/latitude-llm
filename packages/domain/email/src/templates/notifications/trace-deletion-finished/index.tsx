import { Effect } from "effect"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../../utils/render.ts"
import type { NotificationEmailRenderContext, NotificationEmailRenderer } from "../types.ts"
import { TraceDeletionFinishedEmail } from "./EmailTemplate.tsx"

const scopeOf = (ctx: NotificationEmailRenderContext): string =>
  ctx.project ? `${ctx.organization.name} / ${ctx.project.name}` : ctx.organization.name

export const traceDeletionFinishedRenderer: NotificationEmailRenderer<"trace-deletion.finished"> = (payload, ctx) =>
  Effect.tryPromise({
    try: async () => {
      const scope = scopeOf(ctx)
      const traces = `${payload.matchedTraceCount.toLocaleString("en-US")} ${payload.matchedTraceCount === 1 ? "trace" : "traces"}`
      const title = payload.status === "completed" ? "Your trace deletion finished" : "Your trace deletion failed"
      const body =
        payload.status === "completed"
          ? `${traces} were permanently deleted from ${scope}, with their spans, scores and search indexes.`
          : `The deletion in ${scope} stopped after deleting ${traces}. Request it again to delete the rest.`
      const historyUrl = ctx.project
        ? `${ctx.webAppUrl.replace(/\/$/, "")}/projects/${ctx.project.slug}/settings/data-deletion`
        : undefined
      const html = await renderEmail(
        <TraceDeletionFinishedEmail title={title} body={body} historyUrl={historyUrl} webAppUrl={ctx.webAppUrl} />,
      )
      return { html, subject: title, text: `${body}${historyUrl ? `\n\n${historyUrl}` : ""}\n\n— Latitude` }
    },
    catch: (cause) => ({
      _tag: "RenderNotificationEmailError" as const,
      message: "Failed to render trace-deletion.finished email",
      cause,
    }),
  })

export default TraceDeletionFinishedEmail
