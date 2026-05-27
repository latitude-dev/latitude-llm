import { useQuery } from "@tanstack/react-query"
import { type ChangelogEntryRecord, listChangelogEntries } from "./changelog.functions.ts"

const CHANGELOG_QUERY_KEY = ["changelog", "entries"] as const

const EMPTY_ENTRIES: readonly ChangelogEntryRecord[] = []

export function useChangelogEntries() {
  const { data, isLoading } = useQuery({
    queryKey: CHANGELOG_QUERY_KEY,
    queryFn: () => listChangelogEntries(),
    staleTime: 5 * 60 * 1000,
  })

  return { entries: data ?? EMPTY_ENTRIES, isLoading }
}
