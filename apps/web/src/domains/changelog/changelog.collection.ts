import { useQuery } from "@tanstack/react-query"
import { type ChangelogEntryRecord, listChangelogEntries } from "./changelog.functions.ts"

const CHANGELOG_QUERY_KEY = ["changelog", "entries"] as const

// The changelog changes a few times a week at most — pair with server-side Redis TTL.
const CHANGELOG_STALE_TIME_MS = 6 * 60 * 60 * 1000
const CHANGELOG_REFETCH_INTERVAL_MS = 6 * 60 * 60 * 1000

const EMPTY_ENTRIES: readonly ChangelogEntryRecord[] = []

export function useChangelogEntries() {
  const { data, isLoading } = useQuery({
    queryKey: CHANGELOG_QUERY_KEY,
    queryFn: () => listChangelogEntries(),
    staleTime: CHANGELOG_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchInterval: CHANGELOG_REFETCH_INTERVAL_MS,
  })

  return { entries: data ?? EMPTY_ENTRIES, isLoading }
}
