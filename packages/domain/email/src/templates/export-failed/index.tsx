// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { ExportFailedEmail } from "./EmailTemplate.tsx"

export interface ExportFailedEmailData {
  readonly exportName: string
  readonly recipientName?: string
}

export async function exportFailedTemplate(data: ExportFailedEmailData): Promise<RenderedEmail> {
  return {
    html: await renderEmail(
      <ExportFailedEmail
        exportName={data.exportName}
        {...(data.recipientName !== undefined ? { recipientName: data.recipientName } : {})}
      />,
    ),
    subject: `Your "${data.exportName}" export could not be completed`,
    text: `Hi, we couldn't complete your Latitude export "${data.exportName}". Please try again from Latitude. If it keeps failing, contact support and we'll investigate.`,
  }
}
