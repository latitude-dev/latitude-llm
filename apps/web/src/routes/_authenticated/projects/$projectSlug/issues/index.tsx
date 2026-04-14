import { Input, Tabs } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ActivityIcon, ArchiveIcon, SearchIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useDebounce } from "react-use"
import { useIssues } from "../../../../../domains/issues/issues.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import { IssueDetailDrawer } from "./-components/issue-detail-drawer.tsx"
import { IssuesAnalyticsPanel } from "./-components/issues-analytics-panel.tsx"
import {
  ISSUES_COLUMN_OPTIONS,
  type IssuesColumnId,
  type IssuesTableSorting,
  IssuesView,
} from "./-components/issues-view.tsx"

const DEFAULT_SORTING: IssuesTableSorting = { column: "lastSeen", direction: "desc" }
const DEFAULT_COLUMNS: IssuesColumnId[] = ISSUES_COLUMN_OPTIONS.map((column) => column.id)
const ISSUE_SEARCH_DEBOUNCE_MS = 300

function parseColumnIds(raw?: string): IssuesColumnId[] {
  const values = raw
    ?.split(",")
    .map((value) => value.trim())
    .filter((value): value is IssuesColumnId => ISSUES_COLUMN_OPTIONS.some((column) => column.id === value))

  if (!values || values.length === 0) {
    return [...DEFAULT_COLUMNS]
  }

  return values.includes("issue") ? values : ["issue", ...values]
}

function serializeColumnIds(columnIds: readonly IssuesColumnId[]): string {
  return Array.from(new Set(["issue", ...columnIds])).join(",")
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/issues/")({
  component: IssuesPage,
})

function IssuesPage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()
  const [activeIssueId, setActiveIssueId] = useParamState("issueId", "")
  const [lifecycleGroup, setLifecycleGroup] = useParamState("issuesLifecycle", "active", {
    validate: (value): value is "active" | "archived" => value === "active" || value === "archived",
  })
  const [rawColumns, setRawColumns] = useParamState("issuesColumns", serializeColumnIds(DEFAULT_COLUMNS))
  const [timeFrom, setTimeFrom] = useParamState("issuesTimeFrom", "")
  const [timeTo, setTimeTo] = useParamState("issuesTimeTo", "")
  const [searchQuery, setSearchQuery] = useParamState("issuesSearch", "")
  const [searchInput, setSearchInput] = useState(searchQuery)
  const [sorting, setSorting] = useState<IssuesTableSorting>(DEFAULT_SORTING)
  const issueIdsRef = useRef<string[]>([])

  useDebounce(
    () => {
      const normalizedSearchQuery = searchInput.trim()
      if (normalizedSearchQuery !== searchQuery) {
        setSearchQuery(normalizedSearchQuery)
      }
    },
    ISSUE_SEARCH_DEBOUNCE_MS,
    [searchInput, searchQuery, setSearchQuery],
  )

  const visibleColumnIds = parseColumnIds(rawColumns || undefined)
  const timeRange =
    timeFrom || timeTo
      ? {
          ...(timeFrom ? { fromIso: timeFrom } : {}),
          ...(timeTo ? { toIso: timeTo } : {}),
        }
      : undefined

  const {
    data: issues,
    analytics,
    occurrencesSum,
    isLoading,
    infiniteScroll,
  } = useIssues({
    projectId: project.id,
    lifecycleGroup,
    sorting,
    ...(searchQuery ? { searchQuery } : {}),
    ...(timeRange ? { timeRange } : {}),
  })

  const currentIssueIndex = activeIssueId ? issueIdsRef.current.indexOf(activeIssueId) : -1
  const canNavigateNext =
    issueIdsRef.current.length > 0 && (currentIssueIndex < 0 || currentIssueIndex < issueIdsRef.current.length - 1)
  const canNavigatePrev = issueIdsRef.current.length > 0 && (currentIssueIndex < 0 || currentIssueIndex > 0)

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem>
              <TimeFilterDropdown
                {...(timeFrom ? { startTimeFrom: timeFrom } : {})}
                {...(timeTo ? { startTimeTo: timeTo } : {})}
                onChange={(from, to) => {
                  setTimeFrom(from ?? "")
                  setTimeTo(to ?? "")
                }}
              />
              <ColumnsSelector
                columns={ISSUES_COLUMN_OPTIONS}
                selectedColumnIds={visibleColumnIds}
                onChange={(nextColumnIds) => setRawColumns(serializeColumnIds(nextColumnIds as IssuesColumnId[]))}
              />
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <Tabs
                variant="bordered"
                size="sm"
                options={[
                  {
                    id: "active",
                    label: "Active",
                    icon: <ActivityIcon className="w-4 h-4" />,
                  },
                  {
                    id: "archived",
                    label: "Archived",
                    icon: <ArchiveIcon className="w-4 h-4" />,
                  },
                ]}
                active={lifecycleGroup}
                onSelect={(value) => setLifecycleGroup(value)}
              />
              <div className="relative">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search issues"
                  size="sm"
                  className="w-64 pl-8"
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <div className="px-6">
          <IssuesAnalyticsPanel
            analytics={analytics}
            isLoading={isLoading && issues.length === 0}
            onRangeSelect={(range) => {
              setTimeFrom(range?.from ?? "")
              setTimeTo(range?.to ?? "")
            }}
          />
        </div>
        <IssuesView
          issues={issues}
          isLoading={isLoading}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          occurrencesSum={occurrencesSum}
          visibleColumnIds={visibleColumnIds}
          activeIssueId={activeIssueId || undefined}
          onSortChange={setSorting}
          onActiveIssueChange={(issueId) => setActiveIssueId(issueId ?? "")}
          issueIdsRef={issueIdsRef}
        />
      </Layout.Content>
      {activeIssueId ? (
        <Layout.Aside>
          <IssueDetailDrawer
            key={activeIssueId}
            projectSlug={projectSlug}
            projectId={project.id}
            issueId={activeIssueId}
            onClose={() => setActiveIssueId("")}
            onNextIssue={() => {
              const nextIssueId = issueIdsRef.current[currentIssueIndex + 1]
              if (nextIssueId) {
                setActiveIssueId(nextIssueId)
              }
            }}
            onPrevIssue={() => {
              const previousIssueId = issueIdsRef.current[currentIssueIndex - 1]
              if (previousIssueId) {
                setActiveIssueId(previousIssueId)
              }
            }}
            canNavigateNext={canNavigateNext}
            canNavigatePrev={canNavigatePrev}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}
