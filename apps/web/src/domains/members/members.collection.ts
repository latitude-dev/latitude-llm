import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, createOptimisticAction, useLiveQuery } from "@tanstack/react-db"
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

const queryClient = getQueryClient()

const membersCollection = createCollection(
  queryCollectionOptions({
    queryClient,
    queryKey: ["members"],
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
  await queryClient.invalidateQueries({ queryKey: ["members"] })
}

export function removeMemberMutation(membershipId: string) {
  return membersCollection.delete(membershipId)
}

export async function updateMemberRoleMutation(targetUserId: string, newRole: "admin" | "member"): Promise<void> {
  await updateMemberRole({
    data: { targetUserId, newRole },
  })
  await queryClient.invalidateQueries({ queryKey: ["members"] })
}

export async function transferOwnershipMutation(newOwnerUserId: string): Promise<void> {
  await transferOwnership({
    data: { newOwnerUserId },
  })
  await queryClient.invalidateQueries({ queryKey: ["members"] })
}

const cancelInviteAction = createOptimisticAction<{ inviteId: string }>({
  onMutate: ({ inviteId }) => {
    membersCollection.delete(inviteId)
  },
  mutationFn: async ({ inviteId }) => {
    await cancelInvite({
      data: { inviteId },
    })

    await queryClient.invalidateQueries({ queryKey: ["members"] })
  },
})

export function cancelMemberInviteMutation(inviteId: string) {
  return cancelInviteAction({ inviteId })
}

export const useMembersCollection = () => {
  return useLiveQuery((query) => query.from({ member: membersCollection }))
}
