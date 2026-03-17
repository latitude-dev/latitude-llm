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
    subject: `${data.inviterName} invited you to join ${data.organizationName} on Latitude`,
    text: `${data.inviterName} invited you to join ${data.organizationName} on Latitude. Accept the invitation: ${data.magicLinkUrl}`,
  }
}
