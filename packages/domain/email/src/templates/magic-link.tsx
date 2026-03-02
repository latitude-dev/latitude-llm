import { renderEmail } from "../utils/render.js"
import { MagicLinkEmail } from "./MagicLinkEmail.js"

export interface MagicLinkEmailData {
  readonly userName: string
  readonly magicLinkUrl: string
}

export async function magicLinkTemplate(data: MagicLinkEmailData): Promise<string> {
  return renderEmail(<MagicLinkEmail userName={data.userName} magicLinkUrl={data.magicLinkUrl} />)
}
