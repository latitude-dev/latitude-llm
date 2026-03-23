import { generateId } from "@domain/shared"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, createOptimisticAction, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { MemberRecord } from "./members.functions.ts"
import { cancelMemberInvite, inviteMember, listMembers, removeMember } from "./members.functions.ts"

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

const inviteMemberIntentAction = createOptimisticAction<{ email: string; intentId: string }>({
  onMutate: ({ email, intentId }) => {
    membersCollection.insert({
      id: intentId,
      userId: null,
      name: null,
      email,
      role: "member",
      status: "invited",
      confirmedAt: null,
      createdAt: new Date().toISOString(),
    })
  },
  mutationFn: async ({ email, intentId }) => {
    await inviteMember({
      data: {
        email,
        intentId,
      },
    })

    await queryClient.invalidateQueries({ queryKey: ["members"] })
  },
})

export function createMemberInviteIntentMutation(email: string) {
  const intentId = generateId()
  const transaction = inviteMemberIntentAction({
    email,
    intentId,
  })
  return { intentId, transaction }
}

export function removeMemberMutation(membershipId: string) {
  return membersCollection.delete(membershipId)
}

const cancelInviteIntentAction = createOptimisticAction<{ inviteId: string }>({
  onMutate: ({ inviteId }) => {
    membersCollection.delete(inviteId)
  },
  mutationFn: async ({ inviteId }) => {
    await cancelMemberInvite({
      data: { inviteId },
    })

    await queryClient.invalidateQueries({ queryKey: ["members"] })
  },
})

export function cancelMemberInviteMutation(inviteId: string) {
  return cancelInviteIntentAction({ inviteId })
}

export const useMembersCollection = () => {
  return useLiveQuery((query) => query.from({ member: membersCollection }))
}
