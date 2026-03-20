import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
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
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const { intentId } = await inviteMember({
            data: {
              email: mutation.modified.email,
            },
          })

          const { error } = await authClient.signIn.magicLink({
            email: mutation.modified.email,
            callbackURL: `${WEB_BASE_URL}/auth/confirm?authIntentId=${intentId}`,
          })

          if (error) {
            console.warn("Failed to send invitation email", {
              email: mutation.modified.email,
              reason: error.message,
            })
          }
        }),
      )
    },
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

export function createMemberInviteMutation(email: string) {
  return membersCollection.insert(
    {
      id: `pending-invite:${email}:${Date.now()}`,
      userId: null,
      name: null,
      email,
      role: "member",
      status: "invited",
      confirmedAt: null,
      createdAt: new Date().toISOString(),
    },
    { optimistic: false },
  )
}

export const useMembersCollection = () => {
  return useLiveQuery((query) => query.from({ member: membersCollection }))
}
