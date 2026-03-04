import { renderEmail } from "../utils/render.ts"
import { SignupExistingAccountMagicLinkEmail } from "./SignupExistingAccountMagicLinkEmail.tsx"

export interface SignupExistingAccountMagicLinkEmailData {
  readonly userName: string
  readonly magicLinkUrl: string
}

export async function signupExistingAccountMagicLinkTemplate(
  data: SignupExistingAccountMagicLinkEmailData,
): Promise<string> {
  return renderEmail(<SignupExistingAccountMagicLinkEmail userName={data.userName} magicLinkUrl={data.magicLinkUrl} />)
}
