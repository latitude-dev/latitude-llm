import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useMemo } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { listMembers, removeMember } from "./members.functions.ts"
import type { MemberRecord } from "./members.functions.ts"

const queryClient = getQueryClient()

const createMembersCollection = (organizationId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["members", organizationId],
      queryFn: () => listMembers({ data: {} }),
      getKey: (item: MemberRecord) => item.id,
      onDelete: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((mutation) =>
            removeMember({
              data: {
                membershipId: mutation.key,
              },
            }),
          ),
        )
      },
    }),
  )

export const useMembersCollection = (organizationId: string) => {
  const collection = useMemo(() => createMembersCollection(organizationId), [organizationId])
  return useLiveQuery((query) => query.from({ member: collection }))
}
