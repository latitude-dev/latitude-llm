// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { DatasetExportEmail } from "./EmailTemplate.tsx"

export interface DatasetExportEmailData {
  readonly datasetName: string
  readonly downloadUrl: string
  readonly recipientName?: string
}

export async function datasetExportTemplate(data: DatasetExportEmailData): Promise<RenderedEmail> {
  return {
    html: await renderEmail(
      <DatasetExportEmail
        datasetName={data.datasetName}
        downloadUrl={data.downloadUrl}
        {...(data.recipientName !== undefined ? { recipientName: data.recipientName } : {})}
      />,
    ),
    subject: `Your "${data.datasetName}" export is ready to download`,
    text: `Hi, your Latitude dataset "${data.datasetName}" has been exported. Download it here: ${data.downloadUrl}`,
  }
}
