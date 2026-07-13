import { redirect } from "@tanstack/react-router"
import { setActiveOrganization } from "../domains/auth/auth.functions.ts"
import { listOrganizations } from "../domains/organizations/organizations.functions.ts"

export interface Organization {
  readonly id: string
  readonly name: string
  readonly slug: string
}

export type EntryDestination =
  | { readonly kind: "welcome" }
  | { readonly kind: "choose"; readonly organizations: readonly Organization[] }

// Shared no-active-org routing for the entry loaders. Trap: the single-org case
// isn't returned — it activates the org and throws a redirect from here.
export async function resolveEntryDestination(): Promise<EntryDestination> {
  const organizations = ((await listOrganizations()) ?? []) as Organization[]
  if (organizations.length > 1) return { kind: "choose", organizations }

  const [only] = organizations
  if (only) {
    // NOTE: for some reason we cannot use better auth client here so we have
    // this serverfn indirection
    await setActiveOrganization({ data: { organizationId: only.id, organizationSlug: only.slug } })
    throw redirect({ to: "/" })
  }

  return { kind: "welcome" }
}
