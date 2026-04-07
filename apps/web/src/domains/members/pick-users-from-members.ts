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

/** Build once (e.g. `useMemo`) and pass to `pickUsersFromMembersMap` / `pickUserFromMembersMap` per row. */
export function membersByUserId(members: readonly MemberRecord[]): ReadonlyMap<string, MemberRecord> {
  const map = new Map<string, MemberRecord>()
  for (const m of members) {
    if (m.userId) map.set(m.userId, m)
  }
  return map
}

export function pickUsersFromMembersMap(
  byUserId: ReadonlyMap<string, MemberRecord>,
  userIds: readonly string[],
): readonly PickedOrgUser[] {
  return userIds.map((id) => {
    const m = byUserId.get(id)
    return m
      ? { id, name: displayNameForMember(m), imageSrc: m.image }
      : { id, name: UNKNOWN_USER_NAME, imageSrc: null }
  })
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
