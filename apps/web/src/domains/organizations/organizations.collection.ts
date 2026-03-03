import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { createOrganization, listOrganizations } from "./organizations.functions.ts"
import type { CreateOrganizationInput, OrganizationRecord } from "./organizations.types.ts"

const queryClient = getQueryClient()

const organizationsCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["organizations"],
    queryFn: () => listOrganizations(),
    getKey: (item: OrganizationRecord) => item.id,
    onInsert: async ({ transaction }: { transaction: { mutations: Array<{ modified: OrganizationRecord }> } }) => {
      await Promise.all(
        transaction.mutations.map((mutation: { modified: OrganizationRecord }) =>
          createOrganization({
            data: {
              name: mutation.modified.name,
              slug: mutation.modified.slug,
            } satisfies CreateOrganizationInput,
          }),
        ),
      )
    },
  }),
)

export const useOrganizationsCollection = () => {
  return useLiveQuery((query) => query.from({ organization: organizationsCollection }))
}
