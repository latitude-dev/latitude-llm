import { useMemo } from "react"
import { useProjectMembersCollection } from "../../domains/members/members.collection.ts"
import { authClient } from "../../lib/auth-client.ts"
import type { StaticFilterItem } from "./multi-select-filter.tsx"

/**
 * Options for the "Scored by" picker: the project's active members, the current user pinned on top.
 * Reads the session from the auth client (not the `/_authenticated` route loader) so the filter
 * works in the sandbox shell too, where a dev can create scores via the API.
 */
export function useAnnotatorFilterItems(): readonly StaticFilterItem[] {
  const { data: session } = authClient.useSession()
  const meId = session?.user.id
  const { data: members } = useProjectMembersCollection()

  return useMemo(() => {
    const active = (members ?? []).filter((m) => m.status === "active" && m.userId)
    const others = active
      .filter((m) => m.userId !== meId)
      .map((m) => ({ value: m.userId as string, label: m.name?.trim() || m.email }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return meId ? [{ value: meId, label: "Your scores" }, ...others] : others
  }, [members, meId])
}
