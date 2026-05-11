// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers (tsx/esbuild classic transform)
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { ClaudeCodeWrappedEmail } from "./EmailTemplate.tsx"

export interface ClaudeCodeWrappedEmailData {
  readonly userName: string
  readonly projectName: string
  readonly windowStart: Date
  readonly windowEnd: Date
  readonly totalSessions: number
}

export async function claudeCodeWrappedTemplate(data: ClaudeCodeWrappedEmailData): Promise<RenderedEmail> {
  return {
    html: await renderEmail(<ClaudeCodeWrappedEmail {...data} />),
    subject: `Your Claude Code week in ${data.projectName}`,
    text: `Hi ${data.userName}, your Claude Code week in ${data.projectName}: ${data.totalSessions} ${
      data.totalSessions === 1 ? "session" : "sessions"
    }.`,
  }
}
