import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { Context, QueryBuilder, SchemaFromSource } from "@tanstack/react-db"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { OrganizationRecord } from "./organizations.functions.ts"
import { getOrganization, updateOrganization } from "./organizations.functions.ts"

const queryClient = getQueryClient()

const organizationCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["organization"],
    queryFn: async () => [await getOrganization()],
    getKey: (item: OrganizationRecord) => item.id,
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          updateOrganization({
            data: { name: mutation.modified.name, settings: mutation.modified.settings },
          }),
        ),
      )
    },
  }),
)

export function updateOrganizationMutation(id: string, patch: Partial<OrganizationRecord>) {
  return organizationCollection.update(id, (draft) => {
    Object.assign(draft, patch)
  })
}

type OrganizationSource = { organization: typeof organizationCollection }
type OrganizationContext = {
  baseSchema: SchemaFromSource<OrganizationSource>
  schema: SchemaFromSource<OrganizationSource>
  fromSourceName: "organization"
  hasJoins: false
}

export const useOrganizationCollection = <TContext extends Context = OrganizationContext>(
  queryFn?: (orgs: QueryBuilder<OrganizationContext>) => QueryBuilder<TContext>,
  deps?: Array<unknown>,
) => {
  return useLiveQuery<TContext>((q) => {
    const orgs = q.from({ organization: organizationCollection })
    if (queryFn) return queryFn(orgs)
    return orgs as unknown as QueryBuilder<TContext>
  }, deps)
}
