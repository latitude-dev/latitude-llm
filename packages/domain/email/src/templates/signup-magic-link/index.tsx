// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers (tsx/esbuild classic transform)
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { SignupMagicLinkEmail } from "./EmailTemplate.tsx"

export interface SignupMagicLinkEmailData {
  readonly userName: string
  readonly magicLinkUrl: string
}

export async function signupMagicLinkTemplate(data: SignupMagicLinkEmailData): Promise<RenderedEmail> {
  return {
    html: await renderEmail(<SignupMagicLinkEmail userName={data.userName} magicLinkUrl={data.magicLinkUrl} />),
    subject: "Finish setting up your Latitude account",
    text: `Complete your Latitude signup: ${data.magicLinkUrl}`,
  }
}
