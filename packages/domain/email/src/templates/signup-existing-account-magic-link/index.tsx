import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { SignupExistingAccountMagicLinkEmail } from "./EmailTemplate.tsx"

export interface SignupExistingAccountMagicLinkEmailData {
  readonly userName: string
  readonly magicLinkUrl: string
}

export async function signupExistingAccountMagicLinkTemplate(
  data: SignupExistingAccountMagicLinkEmailData,
): Promise<RenderedEmail> {
  return {
    html: await renderEmail(
      <SignupExistingAccountMagicLinkEmail userName={data.userName} magicLinkUrl={data.magicLinkUrl} />,
    ),
    subject: "Sign in to your Latitude account",
    text: `This email is already registered in Latitude. Use this secure link to sign in: ${data.magicLinkUrl}`,
  }
}
