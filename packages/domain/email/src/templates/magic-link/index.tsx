import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { MagicLinkEmail } from "./EmailTemplate.tsx"

export interface MagicLinkEmailData {
  readonly userName: string
  readonly magicLinkUrl: string
}

export async function magicLinkTemplate(data: MagicLinkEmailData): Promise<RenderedEmail> {
  return {
    html: await renderEmail(<MagicLinkEmail userName={data.userName} magicLinkUrl={data.magicLinkUrl} />),
    subject: "Your Latitude magic link",
    text: `Use this link to sign in: ${data.magicLinkUrl}`,
  }
}
