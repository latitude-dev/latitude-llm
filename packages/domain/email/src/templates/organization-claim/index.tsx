// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers (tsx/esbuild classic transform)
import React from "react"
import { renderEmail } from "../../utils/render.ts"
import type { RenderedEmail } from "../types.ts"
import { OrganizationClaimEmail } from "./EmailTemplate.tsx"

export interface OrganizationClaimEmailData {
  readonly claimUrl: string
  readonly organizationName: string
  /** ISO claim deadline; formatted for display and used to create urgency. */
  readonly expiresAt: string
}

function formatClaimDeadline(expiresAt: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(expiresAt))
}

export async function organizationClaimTemplate(data: OrganizationClaimEmailData): Promise<RenderedEmail> {
  const expiresAtLabel = formatClaimDeadline(data.expiresAt)
  return {
    html: await renderEmail(
      <OrganizationClaimEmail
        claimUrl={data.claimUrl}
        organizationName={data.organizationName}
        expiresAtLabel={expiresAtLabel}
      />,
    ),
    subject: `Claim ${data.organizationName} on Latitude`,
    text: `Your new ${data.organizationName} organization has been set up for you on Latitude. Claim it before ${expiresAtLabel}: ${data.claimUrl}`,
  }
}

export default OrganizationClaimEmail
