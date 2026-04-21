// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { ExportReadyEmail } from "./EmailTemplate.tsx"

export interface ExportReadyEmailData {
  readonly exportName: string
  readonly downloadUrl: string
  readonly recipientName?: string
}

export async function exportReadyTemplate(data: ExportReadyEmailData): Promise<RenderedEmail> {
  return {
    html: await renderEmail(
      <ExportReadyEmail
        exportName={data.exportName}
        downloadUrl={data.downloadUrl}
        {...(data.recipientName !== undefined ? { recipientName: data.recipientName } : {})}
      />,
    ),
    subject: `Your "${data.exportName}" export is ready to download`,
    text: `Hi, your Latitude export "${data.exportName}" has been generated. Download it here: ${data.downloadUrl}`,
  }
}
