import { MIN_SEARCH_QUERY_LENGTH, type SearchEntityType } from "@domain/admin"
import { Container, Input, type TabOption, Tabs, Text } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { adminSearch } from "../../domains/admin/admin.functions.ts"
import { SearchResults } from "./-components/search-results.tsx"

const DEBOUNCE_MS = 300

const entityTabs: readonly TabOption<SearchEntityType>[] = [
  { id: "all", label: "All" },
  { id: "user", label: "Users" },
  { id: "organization", label: "Organizations" },
  { id: "project", label: "Projects" },
]

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

  const isQueryTooShort = debouncedQuery.length > 0 && debouncedQuery.length < MIN_SEARCH_QUERY_LENGTH
  const shouldFetch = debouncedQuery.length >= MIN_SEARCH_QUERY_LENGTH

  const { data, isFetching } = useQuery({
    queryKey: ["backoffice", "search", debouncedQuery, entityType],
    queryFn: () => adminSearch({ data: { q: debouncedQuery, type: entityType } }),
    enabled: shouldFetch,
  })

  return (
    <Container className="pt-6 pb-10 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Text.H2 weight="semibold">Search</Text.H2>
        <Text.H5 color="foregroundMuted">Cross-organization lookup for users, organizations, and projects.</Text.H5>
      </div>
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          placeholder="Email, name, slug, or id (min 2 characters)"
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          maxLength={100}
          autoFocus
        />
        <Tabs variant="bordered" size="sm" options={entityTabs} active={entityType} onSelect={setEntityType} />
      </div>
      <SearchResults
        data={data}
        isLoading={shouldFetch && isFetching}
        query={debouncedQuery}
        isQueryTooShort={isQueryTooShort}
      />
    </Container>
  )
}
