import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { useMemoryStores } from "../../../../../domains/memories/memories.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../-route-data.ts"
import { MemoryEmptyState } from "./-components/memory-empty-state.tsx"
import {
  DEFAULT_MEMORY_SORTING,
  type MemoryStoresSorting,
  MemoryStoresView,
} from "./-components/memory-stores-view.tsx"

const SORT_COLUMNS = [
  "lastUpdated",
  "lastRead",
  "records",
  "tokens",
  "sessions",
  "users",
] as const satisfies readonly MemoryStoresSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly MemoryStoresSorting["direction"][]
const SORT_PARAM_PATTERN = /^(lastUpdated|lastRead|records|tokens|sessions|users):(asc|desc)$/

function serializeSorting(sorting: MemoryStoresSorting): string {
  return `${sorting.column}:${sorting.direction}`
}

function parseSorting(raw: string): MemoryStoresSorting {
  const [rawColumn, rawDirection] = raw.split(":")
  // Return allowlist constants, not the raw URL values, so the param's taint ends here.
  const column = SORT_COLUMNS.find((candidate) => candidate === rawColumn)
  const direction = SORT_DIRECTIONS.find((candidate) => candidate === rawDirection)
  if (column && direction) return { column, direction }
  return DEFAULT_MEMORY_SORTING
}

function MemoryBreadcrumb() {
  return <BreadcrumbText variant="current">Memory</BreadcrumbText>
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/memory/")({
  staticData: {
    breadcrumb: MemoryBreadcrumb,
  },
  component: MemoryPage,
})

function MemoryPage() {
  const project = useRouteProject()
  const { projectSlug } = Route.useParams()
  const [rawSorting, setRawSorting] = useParamState("memorySort", serializeSorting(DEFAULT_MEMORY_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const setSorting = useCallback((next: MemoryStoresSorting) => setRawSorting(serializeSorting(next)), [setRawSorting])

  const { stores, isLoading, infiniteScroll } = useMemoryStores({
    projectId: project.id,
    sort: sorting.column,
    direction: sorting.direction,
  })

  const showEmptyState = !isLoading && stores.length === 0

  return (
    <Layout>
      {showEmptyState ? (
        <MemoryEmptyState />
      ) : (
        <MemoryStoresView
          stores={stores}
          isLoading={isLoading}
          sorting={sorting}
          onSortChange={setSorting}
          infiniteScroll={infiniteScroll}
          projectSlug={projectSlug}
        />
      )}
    </Layout>
  )
}
