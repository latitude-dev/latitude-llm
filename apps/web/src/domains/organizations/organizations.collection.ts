import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { listOrganizations } from "./organizations.functions.ts"
import type { OrganizationRecord } from "./organizations.types.ts"

const queryClient = getQueryClient()

const organizationsCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["organizations"],
    queryFn: () => listOrganizations(),
    getKey: (item: OrganizationRecord) => item.id,
  }),
)

export const useOrganizationsCollection = () => {
  return useLiveQuery((query) => query.from({ organization: organizationsCollection }))
}
