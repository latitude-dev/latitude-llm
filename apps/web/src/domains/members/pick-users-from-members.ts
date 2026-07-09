import type { MemberRecord } from "./members.functions.ts"

interface PickedOrgUser {
  readonly id: string
  readonly name: string
  readonly imageSrc: string | null
}

const UNKNOWN_USER_NAME = "Unknown"

function displayNameForMember(m: Pick<MemberRecord, "name" | "email">): string {
  const n = m.name?.trim()
  if (n) return n
  return m.email
}

export function compareMemberLabelsCurrentUserFirst(
  currentUserId: string,
  a: { readonly memberUserId: string; readonly label: string },
  b: { readonly memberUserId: string; readonly label: string },
): number {
  const aIsMe = a.memberUserId === currentUserId
  const bIsMe = b.memberUserId === currentUserId
  if (aIsMe !== bIsMe) return aIsMe ? -1 : 1
  return a.label.localeCompare(b.label)
}

/** Build once (e.g. `useMemo`) and pass to `pickUserFromMembersMap` per row. */
export function membersByUserId(members: readonly MemberRecord[]): ReadonlyMap<string, MemberRecord> {
  const map = new Map<string, MemberRecord>()
  for (const m of members) {
    if (m.userId) map.set(m.userId, m)
  }
  return map
}

export function pickUserFromMembersMap(
  byUserId: ReadonlyMap<string, MemberRecord>,
  userId: string | null,
): PickedOrgUser | null {
  if (!userId) return null
  const m = byUserId.get(userId)
  return m
    ? { id: userId, name: displayNameForMember(m), imageSrc: m.image }
    : { id: userId, name: UNKNOWN_USER_NAME, imageSrc: null }
}
