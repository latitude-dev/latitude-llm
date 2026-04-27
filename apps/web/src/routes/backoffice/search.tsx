import { MIN_SEARCH_QUERY_LENGTH, type SearchEntityType } from "@domain/admin"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { adminSearch } from "../../domains/admin/search.functions.ts"
import { Omnibox } from "./-components/omnibox.tsx"
import { RecentChips } from "./-components/recent-chips.tsx"
import { SearchResults } from "./-components/search-results.tsx"

/**
 * Spotlight-feel search page.
 *
 * The omnibox is the page — no title bar, no description, no
 * ornamentation. Result rows materialise directly underneath as the
 * user types, with a debounced fetch and skeleton placeholders during
 * the request so the layout never jumps. Keyboard navigation between
 * input and rows is wired up in the `Omnibox` component.
 */

const DEBOUNCE_MS = 300

export const Route = createFileRoute("/backoffice/search")({
  component: BackofficeSearchPage,
})

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function BackofficeSearchPage() {
  const [rawQuery, setRawQuery] = useState("")
  const [entityType, setEntityType] = useState<SearchEntityType>("all")
  const debouncedQuery = useDebouncedValue(rawQuery.trim(), DEBOUNCE_MS)
  const resultsRef = useRef<HTMLDivElement>(null)

  const isQueryTooShort = debouncedQuery.length > 0 && debouncedQuery.length < MIN_SEARCH_QUERY_LENGTH
  const shouldFetch = debouncedQuery.length >= MIN_SEARCH_QUERY_LENGTH

  const { data, isFetching } = useQuery({
    queryKey: ["backoffice", "search", debouncedQuery, entityType],
    queryFn: () => adminSearch({ data: { q: debouncedQuery, type: entityType } }),
    enabled: shouldFetch,
  })

  // Show recent chips when the input is empty; hide them once the user
  // starts typing so they don't compete with live results for attention.
  // We key off the trimmed raw value (not the debounced one) so the
  // chips disappear immediately on first keystroke instead of waiting
  // out the 300 ms debounce.
  const showRecent = rawQuery.trim().length === 0

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-12 pb-16">
      <Omnibox
        value={rawQuery}
        onChange={setRawQuery}
        entityType={entityType}
        onEntityTypeChange={setEntityType}
        resultsContainerRef={resultsRef}
      />
      <div ref={resultsRef}>
        {showRecent ? (
          <RecentChips />
        ) : (
          <SearchResults
            data={data}
            isLoading={shouldFetch && isFetching}
            query={debouncedQuery}
            isQueryTooShort={isQueryTooShort}
          />
        )}
      </div>
    </div>
  )
}
