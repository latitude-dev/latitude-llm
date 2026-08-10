import type { Organization } from "@domain/organizations"
import type { OrganizationRedactionSetting } from "@domain/shared"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { Context, QueryBuilder, SchemaFromSource } from "@tanstack/react-db"
import { useLiveQuery } from "@tanstack/react-db"
import { createAppCollection } from "../../lib/data/create-app-collection.ts"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { listOrganizations, updateOrganization, updateOrganizationRedaction } from "./organizations.functions.ts"

const queryClient = getQueryClient()

const organizationsCollection = createAppCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["organizations"],
    queryFn: listOrganizations,
    getKey: (item: Organization) => item.id,
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          updateOrganization({
            data: { name: mutation.modified.name, settings: mutation.modified?.settings ?? {} },
          }),
        ),
      )
    },
  }),
)

export function updateOrganizationMutation(id: string, patch: Partial<Organization>) {
  return organizationsCollection.update(id, (draft) => {
    Object.assign(draft, patch)
  })
}

/** Owner-gated and server-authoritative; see `updateProjectRedactionMutation` for why it refetches. */
export async function updateOrganizationRedactionMutation(redaction: OrganizationRedactionSetting | null) {
  await updateOrganizationRedaction({ data: { redaction } })
  await queryClient.invalidateQueries({ queryKey: ["organizations"] })
}

type OrganizationsSource = { organizations: typeof organizationsCollection }
type OrganizationsContext = {
  baseSchema: SchemaFromSource<OrganizationsSource>
  schema: SchemaFromSource<OrganizationsSource>
  fromSourceName: "organizations"
  hasJoins: false
}

export const useOrganizationsCollection = <TContext extends Context = OrganizationsContext>(
  queryFn?: (orgs: QueryBuilder<OrganizationsContext>) => QueryBuilder<TContext>,
  deps?: Array<unknown>,
) => {
  return useLiveQuery<TContext>((q) => {
    const orgs = q.from({ organizations: organizationsCollection })
    if (queryFn) return queryFn(orgs)
    return orgs as unknown as QueryBuilder<TContext>
  }, deps)
}
