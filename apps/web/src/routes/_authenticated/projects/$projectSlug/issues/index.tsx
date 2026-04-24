import { Button, CloseTrigger, Icon, Input, Label, Modal, Switch, Tabs, Text, toast } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ActivityIcon, ArchiveIcon, CheckIcon, DownloadIcon, PauseIcon, SearchIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { useDebounce } from "react-use"
import { invalidateIssueQueries, useIssues } from "../../../../../domains/issues/issues.collection.ts"
import { applyBulkIssueLifecycleAction, enqueueIssuesExport } from "../../../../../domains/issues/issues.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { EMPTY_SELECTION, type SelectionState, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { ExportConfirmationModal } from "../-components/export-confirmation-modal.tsx"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import { IssueDetailDrawer } from "./-components/issue-detail-drawer.tsx"
import { IssuesAnalyticsPanel } from "./-components/issues-analytics-panel.tsx"
import { IssuesEmptyState } from "./-components/issues-empty-state.tsx"
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
  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [bulkResolveModalOpen, setBulkResolveModalOpen] = useState(false)
  const [bulkIgnoreModalOpen, setBulkIgnoreModalOpen] = useState(false)
  const [keepMonitoring, setKeepMonitoring] = useState(true)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
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
    totalCount,
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
  const issueIds = useMemo(() => issues.map((issue) => issue.id), [issues])
  const selection = useSelectableRows({
    rowIds: issueIds,
    totalRowCount: totalCount,
    controlledState: selectionState,
    onStateChange: setSelectionState,
  })
  const canNavigateNext =
    issueIdsRef.current.length > 0 && (currentIssueIndex < 0 || currentIssueIndex < issueIdsRef.current.length - 1)
  const canNavigatePrev = issueIdsRef.current.length > 0 && (currentIssueIndex < 0 || currentIssueIndex > 0)

  const handleExportIssues = useCallback(async () => {
    const bulkSelection = selection.bulkSelection
    if (!bulkSelection) return

    setExporting(true)
    try {
      await enqueueIssuesExport({
        data: {
          projectId: project.id,
          selection: bulkSelection,
          lifecycleGroup,
          sort: {
            field: sorting.column,
            direction: sorting.direction,
          },
          ...(searchQuery ? { searchQuery } : {}),
          ...(timeRange ? { timeRange } : {}),
        },
      })
      toast({
        title: "Export started",
        description: "You'll receive an email with a download link when your export is ready.",
      })
      selection.clearSelections()
      setExportModalOpen(false)
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Export failed",
      })
    } finally {
      setExporting(false)
    }
  }, [lifecycleGroup, project.id, searchQuery, selection, sorting.column, sorting.direction, timeRange])

  const handleBulkResolve = useCallback(async () => {
    const bulkSelection = selection.bulkSelection
    if (!bulkSelection) return

    setBulkActionLoading(true)
    try {
      const result = await applyBulkIssueLifecycleAction({
        data: {
          projectId: project.id,
          selection: bulkSelection,
          command: "resolve",
          keepMonitoring,
          lifecycleGroup,
          sort: {
            field: sorting.column,
            direction: sorting.direction,
          },
          ...(searchQuery ? { searchQuery } : {}),
          ...(timeRange ? { timeRange } : {}),
        },
      })
      const changedCount = result.items.filter((item) => item.changed).length
      await invalidateIssueQueries(project.id)
      toast({
        description:
          changedCount === 0
            ? "No issues were resolved."
            : changedCount === 1
              ? "1 issue resolved."
              : `${changedCount} issues resolved.`,
      })
      selection.clearSelections()
      setBulkResolveModalOpen(false)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setBulkActionLoading(false)
    }
  }, [keepMonitoring, lifecycleGroup, project.id, searchQuery, selection, sorting.column, sorting.direction, timeRange])

  const handleBulkIgnore = useCallback(async () => {
    const bulkSelection = selection.bulkSelection
    if (!bulkSelection) return

    setBulkActionLoading(true)
    try {
      const result = await applyBulkIssueLifecycleAction({
        data: {
          projectId: project.id,
          selection: bulkSelection,
          command: "ignore",
          lifecycleGroup,
          sort: {
            field: sorting.column,
            direction: sorting.direction,
          },
          ...(searchQuery ? { searchQuery } : {}),
          ...(timeRange ? { timeRange } : {}),
        },
      })
      const changedCount = result.items.filter((item) => item.changed).length
      await invalidateIssueQueries(project.id)
      toast({
        description:
          changedCount === 0
            ? "No issues were ignored."
            : changedCount === 1
              ? "1 issue ignored."
              : `${changedCount} issues ignored.`,
      })
      selection.clearSelections()
      setBulkIgnoreModalOpen(false)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setBulkActionLoading(false)
    }
  }, [lifecycleGroup, project.id, searchQuery, selection, sorting.column, sorting.direction, timeRange])

  const hasActiveFilters = lifecycleGroup !== "active" || searchQuery !== "" || Boolean(timeRange)
  const hasNoIssues = issues.length === 0 && !hasActiveFilters
  const showEmptyState = !isLoading && hasNoIssues

  if (isLoading && hasNoIssues) {
    return null
  }

  if (showEmptyState) {
    return (
      <Layout>
        <Layout.Content>
          <IssuesEmptyState projectSlug={projectSlug} />
        </Layout.Content>
      </Layout>
    )
  }

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
        {selection.selectedCount > 0 && (
          <div className="flex items-center gap-2 px-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkIgnoreModalOpen(true)}
              disabled={bulkActionLoading}
            >
              <Icon icon={PauseIcon} size="sm" />
              Ignore ({selection.selectedCount.toLocaleString()})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setKeepMonitoring(true)
                setBulkResolveModalOpen(true)
              }}
              disabled={bulkActionLoading}
            >
              <Icon icon={CheckIcon} size="sm" />
              Resolve ({selection.selectedCount.toLocaleString()})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} disabled={exporting}>
              <Icon icon={DownloadIcon} size="sm" />
              Export ({selection.selectedCount.toLocaleString()})
            </Button>
          </div>
        )}
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
          selection={selection}
          onSortChange={setSorting}
          onActiveIssueChange={(issueId) => setActiveIssueId(issueId ?? "")}
          issueIdsRef={issueIdsRef}
        />
        {selection.bulkSelection && (
          <ExportConfirmationModal
            open={exportModalOpen}
            onOpenChange={setExportModalOpen}
            itemLabel="issue"
            selectedCount={selection.selectedCount}
            onConfirm={() => void handleExportIssues()}
            exporting={exporting}
          />
        )}

        <Modal.Root open={bulkResolveModalOpen} onOpenChange={setBulkResolveModalOpen}>
          <Modal.Content dismissible>
            <Modal.Header
              title="Resolve issues"
              description={`Mark ${selection.selectedCount === 1 ? "this issue" : `${selection.selectedCount} issues`} as resolved. If any of these issues start occurring again we will alert you and promote them as regressed.`}
            />
            <Modal.Body>
              <div className="flex flex-col gap-3">
                <div className="flex flex-row items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="bulk-keep-monitoring">Keep monitoring these issues</Label>
                    <Text.H6 color="foregroundMuted">
                      Evaluations monitoring these issues will stay active to detect further regressions
                    </Text.H6>
                  </div>
                  <Switch
                    id="bulk-keep-monitoring"
                    checked={keepMonitoring}
                    onCheckedChange={setKeepMonitoring}
                    disabled={bulkActionLoading}
                    aria-label="Keep monitoring these issues"
                  />
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline" onClick={() => setBulkResolveModalOpen(false)} disabled={bulkActionLoading}>
                Cancel
              </Button>
              <Button onClick={() => void handleBulkResolve()} disabled={bulkActionLoading}>
                <Icon icon={CheckIcon} size="sm" />
                Resolve {selection.selectedCount === 1 ? "Issue" : `${selection.selectedCount} Issues`}
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>

        <Modal.Root open={bulkIgnoreModalOpen} onOpenChange={setBulkIgnoreModalOpen}>
          <Modal.Content dismissible>
            <Modal.Header
              title="Ignore issues"
              description={`Mark ${selection.selectedCount === 1 ? "this issue" : `${selection.selectedCount} issues`} as ignored. We won't monitor or alert you about new occurrences of these issues anymore.`}
            />
            <Modal.Footer>
              <CloseTrigger />
              <Button variant="destructive" onClick={() => void handleBulkIgnore()} disabled={bulkActionLoading}>
                <Icon icon={PauseIcon} size="sm" />
                Ignore {selection.selectedCount === 1 ? "Issue" : `${selection.selectedCount} Issues`}
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
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
