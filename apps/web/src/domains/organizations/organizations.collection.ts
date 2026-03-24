import type { Organization } from "@domain/organizations"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { Context, QueryBuilder, SchemaFromSource } from "@tanstack/react-db"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { listOrganizations, updateOrganization } from "./organizations.functions.ts"

const queryClient = getQueryClient()

const organizationsCollection = createCollection(
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
