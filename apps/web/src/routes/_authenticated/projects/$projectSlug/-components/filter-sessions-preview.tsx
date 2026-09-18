import type { FilterSet } from "@domain/shared"
import type { InfiniteTableSorting } from "@repo/ui"
import { type ReactNode, useMemo, useState } from "react"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { EMPTY_SELECTION } from "../../../../../lib/hooks/useSelectableRows.ts"
import { SessionDetailDrawer } from "./session-detail-drawer.tsx"
import { DEFAULT_SESSION_SORTING, getSessionColumnOptions, SessionsView } from "./sessions-view.tsx"

const noop = () => undefined

/**
 * Reusable "filters on the left, matching sessions on the right" explorer.
 *
 * Renders the same sessions `InfiniteTable` the Sessions view uses (minus row
 * selection) and opens the session detail panel on row click, all driven by a
 * `filters` / `onFilterChange` pair. It owns the single page `Layout` (toolbar
 * `header` slot above, sessions body below, detail drawer as the sibling aside)
 * so it drops straight into a route — do NOT wrap it in another `Layout`.
 * Domain screens (creating a custom behavior now, experiments later) pass their
 * chrome via `header`. Pass `excludeFilterFields` to hide fields a domain can't
 * use (e.g. `topics` for custom behaviors).
 */
export function FilterSessionsPreview({
  projectId,
  filters,
  onFilterChange,
  excludeFilterFields,
  header,
}: {
  readonly projectId: string
  readonly filters: FilterSet
  readonly onFilterChange: (filters: FilterSet) => void
  readonly excludeFilterFields?: readonly string[]
  /** Chrome rendered above the sessions body, inside the page content column. */
  readonly header?: ReactNode
}) {
  const [activeSessionId, setActiveSessionId] = useState("")
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SESSION_SORTING)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const visibleColumnIds = useMemo(() => getSessionColumnOptions(false).map((column) => column.id), [])

  return (
    <Layout>
      <Layout.Content>
        {header}
        <SessionsView
          projectId={projectId}
          filters={filters}
          filtersOpen={filtersOpen}
          activeSessionId={activeSessionId || undefined}
          sorting={sorting}
          onSortingChange={setSorting}
          selectionState={EMPTY_SELECTION}
          onSelectionChange={noop}
          totalTraceCount={0}
          onFiltersChange={onFilterChange}
          onShowAllSessions={noop}
          onFiltersClose={() => setFiltersOpen(false)}
          onOpenSession={(sessionId) => setActiveSessionId(sessionId)}
          onCloseSession={() => setActiveSessionId("")}
          visibleColumnIds={visibleColumnIds}
          isSearching={false}
          hasUserAppliedFilters
          selectable={false}
          {...(excludeFilterFields ? { excludeFilterFields } : {})}
        />
      </Layout.Content>
      {activeSessionId ? (
        <Layout.Aside>
          <SessionDetailDrawer
            key={activeSessionId}
            projectId={projectId}
            sessionId={activeSessionId}
            onClose={() => setActiveSessionId("")}
            filters={filters}
            onFiltersChange={onFilterChange}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}
