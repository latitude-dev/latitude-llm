// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers (tsx/esbuild classic transform)
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { InviteMagicLinkEmail } from "./EmailTemplate.tsx"

export interface InviteMagicLinkEmailData {
  readonly inviterName: string
  readonly organizationName: string
  readonly magicLinkUrl: string
}

export async function inviteMagicLinkTemplate(data: InviteMagicLinkEmailData): Promise<RenderedEmail> {
  return {
    html: await renderEmail(
      <InviteMagicLinkEmail
        inviterName={data.inviterName}
        organizationName={data.organizationName}
        magicLinkUrl={data.magicLinkUrl}
      />,
    ),
    subject: `Join ${data.organizationName} on Latitude — invited by ${data.inviterName}`,
    text: `${data.inviterName} wants you to join the ${data.organizationName} workspace on Latitude. Accept here: ${data.magicLinkUrl}`,
  }
}
