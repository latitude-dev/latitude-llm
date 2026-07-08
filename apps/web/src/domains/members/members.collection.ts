import { SHOWCASE_ORG_CACHE_KEY } from "@domain/shared"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createOptimisticAction, useLiveQuery } from "@tanstack/react-db"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createAppCollection } from "../../lib/data/create-app-collection.ts"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { type ProjectScope, useProjectScope } from "../projects/project-scope.tsx"
import type { MemberRecord } from "./members.functions.ts"
import {
  cancelInvite,
  invite,
  listMembers,
  listProjectMembers,
  removeMember,
  transferOwnership,
  updateMemberRole,
} from "./members.functions.ts"
import { membersByUserId } from "./pick-users-from-members.ts"

const queryClient = getQueryClient()

const EMPTY_MEMBER_BY_USER_ID_MAP: ReadonlyMap<string, MemberRecord> = new Map()

// ---------------------------------------------------------------------------
// Session-org members — the viewer's OWN organization.
//
// Backs the Members / Organization / SSO settings surfaces and every member
// mutation. Always the session org (`listMembers` resolves it from the session,
// ignoring the ambient project scope), so a single unscoped collection is
// correct: a showcase/sandbox URL must never change whose members you manage.
// ---------------------------------------------------------------------------

const MEMBERS_QUERY_KEY = ["members"] as const

const membersCollection = createAppCollection(
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

export const useMembersCollection = () => {
  return useLiveQuery((query) => query.from({ member: membersCollection }))
}

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

// ---------------------------------------------------------------------------
// Project-scoped members — the CURRENT PROJECT's organization (read-only).
//
// Backs assignee filters and `userId → member` attribution maps on project data
// (signals, annotations, timelines), where names must belong to the org that
// owns that data. `listProjectMembers` resolves the org from the request scope
// (live → session, sandbox → sandbox, showcase → showcase). Members are
// org-level (no projectId in the key), so each scope needs its own query-key
// namespace or a showcase/sandbox read would collide with the live org in the
// shared cache. Live is unmarked; showcase uses a stable constant (its org id is
// resolved server-side, never sent to the client); sandbox carries its
// client-provided org id.
// ---------------------------------------------------------------------------

function projectMembersScopeNamespace(scope: ProjectScope): readonly string[] {
  switch (scope.kind) {
    case "live":
      return []
    case "showcase":
      return [SHOWCASE_ORG_CACHE_KEY]
    case "sandbox":
      return [scope.orgId]
  }
}

const projectMembersQueryKey = (scope: ProjectScope) =>
  [...projectMembersScopeNamespace(scope), "project-members"] as const

const makeProjectMembersCollection = (scope: ProjectScope) =>
  createAppCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: projectMembersQueryKey(scope),
      queryFn: () => listProjectMembers(),
      getKey: (item: MemberRecord) => item.id,
    }),
  )

type ProjectMembersCollection = ReturnType<typeof makeProjectMembersCollection>

// One collection instance per scope namespace, so a showcase read never bleeds
// its rows into the viewer's live bucket. Bounded in practice: live, showcase,
// and the handful of sandbox orgs a session touches.
const projectMembersCollectionsCache = new Map<string, ProjectMembersCollection>()

const getProjectMembersCollection = (scope: ProjectScope): ProjectMembersCollection => {
  const cacheKey = projectMembersScopeNamespace(scope).join(":")
  let collection = projectMembersCollectionsCache.get(cacheKey)
  if (!collection) {
    collection = makeProjectMembersCollection(scope)
    projectMembersCollectionsCache.set(cacheKey, collection)
  }
  return collection
}

export const useProjectMembersCollection = () => {
  const scope = useProjectScope()
  const namespace = projectMembersScopeNamespace(scope).join(":")
  const collection = getProjectMembersCollection(scope)
  return useLiveQuery((query) => query.from({ member: collection }), [namespace])
}

/**
 * Project-org members keyed by Better Auth `userId`, cached in TanStack Query as
 * derived state of the current scope's project-members query. Recomputes when
 * that query cache updates (`dataUpdatedAt`).
 *
 * Still calls `useProjectMembersCollection()` so the hook re-renders when
 * TanStack DB syncs, which keeps `dataUpdatedAt` in sync; there is no second
 * network request.
 */
export function useProjectMemberByUserIdMap(): ReadonlyMap<string, MemberRecord> {
  const scope = useProjectScope()
  const queryClient = useQueryClient()
  useProjectMembersCollection()

  const scopedKey = projectMembersQueryKey(scope)
  const membersVersion = queryClient.getQueryState(scopedKey)?.dataUpdatedAt ?? 0

  const { data } = useQuery({
    queryKey: [...scopedKey, "byUserId", membersVersion],
    queryFn: () => {
      const rows = queryClient.getQueryData<MemberRecord[]>(scopedKey) ?? []
      return membersByUserId(rows)
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 30,
  })

  return data ?? EMPTY_MEMBER_BY_USER_ID_MAP
}
