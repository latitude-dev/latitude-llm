import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, createOptimisticAction, useLiveQuery } from "@tanstack/react-db"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { MemberRecord } from "./members.functions.ts"
import {
  cancelInvite,
  invite,
  listMembers,
  removeMember,
  transferOwnership,
  updateMemberRole,
} from "./members.functions.ts"
import { membersByUserId } from "./pick-users-from-members.ts"

const queryClient = getQueryClient()

/** TanStack Query key for the org members collection sync (see `membersCollection`). */
const MEMBERS_QUERY_KEY = ["members"] as const

const EMPTY_MEMBER_BY_USER_ID_MAP: ReadonlyMap<string, MemberRecord> = new Map()

const membersCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: MEMBERS_QUERY_KEY,
    queryFn: () => listMembers(),
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

/**
 * Invite is not a collection mutation, so it must not use `createOptimisticAction` with an empty
 * `onMutate`: TanStack DB skips `mutationFn` when the transaction has zero pending mutations.
 */
export async function inviteMemberMutation(email: string): Promise<void> {
  await invite({
    data: { email },
  })
  await queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
}

export function removeMemberMutation(membershipId: string) {
  return membersCollection.delete(membershipId)
}

export async function updateMemberRoleMutation(targetUserId: string, newRole: "admin" | "member"): Promise<void> {
  await updateMemberRole({
    data: { targetUserId, newRole },
  })
  await queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
}

export async function transferOwnershipMutation(newOwnerUserId: string): Promise<void> {
  await transferOwnership({
    data: { newOwnerUserId },
  })
  await queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
}

const cancelInviteAction = createOptimisticAction<{ inviteId: string }>({
  onMutate: ({ inviteId }) => {
    membersCollection.delete(inviteId)
  },
  mutationFn: async ({ inviteId }) => {
    await cancelInvite({
      data: { inviteId },
    })

    await queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY })
  },
})

export function cancelMemberInviteMutation(inviteId: string) {
  return cancelInviteAction({ inviteId })
}

export const useMembersCollection = () => {
  return useLiveQuery((query) => query.from({ member: membersCollection }))
}

/**
 * Org members keyed by Better Auth `userId`, cached in TanStack Query as derived state of
 * {@link MEMBERS_QUERY_KEY}. Recomputes when the members query cache updates (`dataUpdatedAt`).
 *
 * Still calls `useMembersCollection()` so the hook re-renders when TanStack DB syncs, which keeps
 * `dataUpdatedAt` in sync; there is no second network request.
 */
export function useMemberByUserIdMap(): ReadonlyMap<string, MemberRecord> {
  const queryClient = useQueryClient()
  useMembersCollection()

  const membersVersion = queryClient.getQueryState(MEMBERS_QUERY_KEY)?.dataUpdatedAt ?? 0

  const { data } = useQuery({
    queryKey: [...MEMBERS_QUERY_KEY, "byUserId", membersVersion],
    queryFn: () => {
      const rows = queryClient.getQueryData<MemberRecord[]>(MEMBERS_QUERY_KEY) ?? []
      return membersByUserId(rows)
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 30,
  })

  return data ?? EMPTY_MEMBER_BY_USER_ID_MAP
}
