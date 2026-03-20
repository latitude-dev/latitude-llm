import { generateId } from "@domain/shared"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, createOptimisticAction, useLiveQuery } from "@tanstack/react-db"
import { authClient } from "../../lib/auth-client.ts"
import { WEB_BASE_URL } from "../../lib/auth-config.ts"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { MemberRecord } from "./members.functions.ts"
import { inviteMember, listMembers, removeMember } from "./members.functions.ts"

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

export function invalidateMembers() {
  return queryClient.invalidateQueries({ queryKey: ["members"] })
}

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

    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: `${WEB_BASE_URL}/auth/confirm?authIntentId=${intentId}`,
    })

    if (error) {
      console.warn("Failed to send invitation email", {
        email,
        reason: error.message,
      })
    }

    await invalidateMembers()
  },
})

export function createMemberInviteIntentMutation(email: string) {
  return inviteMemberIntentAction({
    email,
    intentId: generateId(),
  })
}

export function removeMemberMutation(membershipId: string) {
  return membersCollection.delete(membershipId)
}

export const useMembersCollection = () => {
  return useLiveQuery((query) => query.from({ member: membersCollection }))
}
