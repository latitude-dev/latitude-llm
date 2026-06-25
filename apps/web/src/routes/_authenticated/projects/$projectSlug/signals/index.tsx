import {
  Badge,
  Button,
  CloseTrigger,
  DotIndicator,
  Icon,
  Input,
  Label,
  Modal,
  Switch,
  Tabs,
  Text,
  Tooltip,
  toast,
  useValueWithDefault,
} from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, redirect, useParams } from "@tanstack/react-router"
import { useProjectFlaggers } from "../../../../../domains/flaggers/flaggers.collection.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"

function SignalsBreadcrumb() {
  const { projectSlug } = useParams({ strict: false })
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.slug, projectSlug ?? "")).findOne(),
    [projectSlug],
  )
  const { data: flaggers = [] } = useProjectFlaggers(project?.id ?? "")
  const hasActiveFlaggers = flaggers.some((f) => f.enabled)

  return (
    <span className="flex min-w-0 items-center gap-0">
      <BreadcrumbText variant="current">Signals</BreadcrumbText>
      {hasActiveFlaggers && (
        <Tooltip
          side="bottom"
          align="center"
          trigger={
            <span className="flex h-5 w-5 shrink-0 items-center justify-center cursor-default">
              <DotIndicator variant="primary" size="md" ping />
            </span>
          }
        >
          Latitude is always scanning for common issues
        </Tooltip>
      )}
    </span>
  )
}

import {
  ActivityIcon,
  ArchiveIcon,
  CheckIcon,
  CircleUserRoundIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { invalidateSignalQueries, useSignals } from "../../../../../domains/signals/signals.collection.ts"
import {
  applyBulkSignalLifecycleAction,
  enqueueSignalsExport,
  type SignalRecord,
} from "../../../../../domains/signals/signals.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useDebounce } from "../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { EMPTY_SELECTION, type SelectionState, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"
import { useAuthenticatedUser } from "../../../-route-data.ts"
import { ColumnsSelector } from "../-components/columns-selector.tsx"
import { ExportConfirmationModal } from "../-components/export-confirmation-modal.tsx"
import { useTableColumnSettings } from "../-components/table-column-settings.ts"
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
import { useRouteProject } from "../-route-data.ts"
import { AssigneeFilter, UNASSIGNED_FILTER_TOKEN } from "./-components/assignee-filter.tsx"
import { SignalsAnalyticsPanel } from "./-components/signals-analytics-panel.tsx"
import { SignalsEmptyState } from "./-components/signals-empty-state.tsx"
import {
  ISSUES_COLUMN_OPTIONS,
  type SignalsColumnId,
  type SignalsTableSorting,
  SignalsView,
} from "./-components/signals-view.tsx"

const DEFAULT_SORTING: SignalsTableSorting = { column: "lastSeen", direction: "desc" }
const SIGNAL_SEARCH_DEBOUNCE_MS = 300
const DEFAULT_SIGNALS_RANGE_SECONDS = 30 * 24 * 60 * 60
const SORT_COLUMNS = [
  "lastSeen",
  "occurrences",
  "affectedSessions",
  "state",
] as const satisfies readonly SignalsTableSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly SignalsTableSorting["direction"][]
const SORT_PARAM_PATTERN = /^(lastSeen|occurrences|affectedSessions|state):(asc|desc)$/
const EMPTY_ISSUES: readonly SignalRecord[] = []

function serializeSorting(sorting: SignalsTableSorting): string {
  return `${sorting.column}:${sorting.direction}`
}

function parseSorting(raw: string): SignalsTableSorting {
  const [column, direction] = raw.split(":")
  if (
    SORT_COLUMNS.includes(column as SignalsTableSorting["column"]) &&
    SORT_DIRECTIONS.includes(direction as SignalsTableSorting["direction"])
  ) {
    return {
      column: column as SignalsTableSorting["column"],
      direction: direction as SignalsTableSorting["direction"],
    }
  }
  return DEFAULT_SORTING
}

// Matches the server's `signalAssigneeFilterSchema`: a 24-char cuid or the
// unassigned sentinel. Invalid URL tokens are dropped instead of erroring.
const ASSIGNEE_TOKEN_PATTERN = /^[a-z0-9]{24}$/

function parseAssignees(raw: string): readonly string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token === UNASSIGNED_FILTER_TOKEN || ASSIGNEE_TOKEN_PATTERN.test(token)),
    ),
  ]
}

function serializeAssignees(tokens: readonly string[]): string {
  return tokens.join(",")
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/signals/")({
  // Preserve every list search param (lifecycle/time/search/sort live in the URL via
  // `useParamState`, not here); we only inspect `signalId`/legacy `issueId` so the drawer
  // deep link — still live in already-sent emails/Slack messages — redirects to the full page.
  validateSearch: (search: Record<string, unknown>): Record<string, unknown> => search,
  beforeLoad: ({ params, search }) => {
    const signalId = search.signalId ?? search.issueId
    if (typeof signalId === "string" && signalId.length > 0) {
      const example = search.example
      throw redirect({
        to: "/projects/$projectSlug/signals/$signalId",
        params: { projectSlug: params.projectSlug, signalId },
        ...(typeof example === "string" && example.length > 0 ? { search: { example } } : {}),
      })
    }
  },
  staticData: {
    breadcrumb: SignalsBreadcrumb,
  },
  component: SignalsPage,
})

function SignalsPage() {
  const project = useRouteProject()
  const me = useAuthenticatedUser()
  const [lifecycleGroup, setLifecycleGroup] = useParamState("signalsLifecycle", "active", {
    validate: (value): value is "active" | "archived" => value === "active" || value === "archived",
  })
  const [timeFrom, setTimeFrom] = useParamState("signalsTimeFrom", "")
  const [timeTo, setTimeTo] = useParamState("signalsTimeTo", "")
  const [assigneesParam, setAssigneesParam] = useParamState("signalsAssignees", "")
  const [searchQuery, setSearchQuery] = useParamState("signalsSearch", "")
  const [searchInput, setSearchInput] = useValueWithDefault(searchQuery)
  const [rawSorting, setRawSorting] = useParamState("signalsSort", serializeSorting(DEFAULT_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const setSorting = useCallback((next: SignalsTableSorting) => setRawSorting(serializeSorting(next)), [setRawSorting])
  // The archived tab lists resolved/ignored issues, so its bulk actions undo
  // the lifecycle commands instead of re-applying them.
  const archived = lifecycleGroup === "archived"
  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [bulkResolveModalOpen, setBulkResolveModalOpen] = useState(false)
  const [bulkIgnoreModalOpen, setBulkIgnoreModalOpen] = useState(false)
  const [keepMonitoring, setKeepMonitoring] = useState(true)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  useDebounce(
    () => {
      const normalizedSearchQuery = searchInput.trim()
      if (normalizedSearchQuery !== searchQuery) {
        setSearchQuery(normalizedSearchQuery)
      }
    },
    SIGNAL_SEARCH_DEBOUNCE_MS,
    [searchInput, searchQuery, setSearchQuery],
  )

  const columnSettings = useTableColumnSettings<SignalsColumnId>({
    storageKey: "projects.issues.columns.v1",
    columns: ISSUES_COLUMN_OPTIONS,
  })
  const timeRange = useMemo(() => {
    const toMs = timeTo ? Date.parse(timeTo) : Date.now()
    const fromMs = timeFrom ? Date.parse(timeFrom) : toMs - DEFAULT_SIGNALS_RANGE_SECONDS * 1000
    return {
      fromIso: new Date(fromMs).toISOString(),
      toIso: new Date(toMs).toISOString(),
    }
  }, [timeFrom, timeTo])

  const assigneeIds = useMemo(() => parseAssignees(assigneesParam), [assigneesParam])
  const setAssigneeIds = useCallback(
    (next: readonly string[]) => setAssigneesParam(serializeAssignees(next)),
    [setAssigneesParam],
  )
  const isMySignalsActive = assigneeIds.length === 1 && assigneeIds[0] === me.id
  const toggleMySignals = useCallback(
    () => setAssigneeIds(isMySignalsActive ? [] : [me.id]),
    [isMySignalsActive, me.id, setAssigneeIds],
  )

  const {
    data: signalsData,
    rowMetricsBySignalId,
    analytics,
    occurrencesSum,
    priorityCounts,
    mySignalsCount,
    totalCount,
    hasAnySignals,
    isLoading,
    isReloading,
    isAnalyticsLoading,
    infiniteScroll,
  } = useSignals({
    projectId: project.id,
    lifecycleGroup,
    sorting,
    ...(assigneeIds.length > 0 ? { assigneeIds } : {}),
    ...(searchQuery ? { searchQuery } : {}),
    ...(timeRange ? { timeRange } : {}),
  })

  // While a filter/sort change is in flight we hide the (now stale) previous
  // rows so the table and analytics fall back to their skeleton state. The
  // surrounding page layout (filters, search, lifecycle tabs) keeps rendering
  // because `isLoading` itself stays false during the placeholder window.
  const showSkeletons = isLoading || isReloading
  const issues = isReloading ? EMPTY_ISSUES : signalsData

  const signalIds = useMemo(() => issues.map((issue) => issue.id), [issues])
  const selection = useSelectableRows({
    rowIds: signalIds,
    totalRowCount: totalCount,
    controlledState: selectionState,
    onStateChange: setSelectionState,
  })

  const handleExportSignals = useCallback(async () => {
    const bulkSelection = selection.bulkSelection
    if (!bulkSelection) return

    setExporting(true)
    try {
      await enqueueSignalsExport({
        data: {
          projectId: project.id,
          selection: bulkSelection,
          lifecycleGroup,
          sort: {
            field: sorting.column,
            direction: sorting.direction,
          },
          ...(assigneeIds.length > 0 ? { assigneeIds: [...assigneeIds] } : {}),
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
      const result = await applyBulkSignalLifecycleAction({
        data: {
          projectId: project.id,
          selection: bulkSelection,
          command: archived ? "unresolve" : "resolve",
          ...(archived ? {} : { keepMonitoring }),
          lifecycleGroup,
          sort: {
            field: sorting.column,
            direction: sorting.direction,
          },
          ...(assigneeIds.length > 0 ? { assigneeIds: [...assigneeIds] } : {}),
          ...(searchQuery ? { searchQuery } : {}),
          ...(timeRange ? { timeRange } : {}),
        },
      })
      const changedCount = result.items.filter((item) => item.changed).length
      const verb = archived ? "unresolved" : "resolved"
      await invalidateSignalQueries(project.id)
      toast({
        description:
          changedCount === 0
            ? `No issues were ${verb}.`
            : changedCount === 1
              ? `1 issue ${verb}.`
              : `${changedCount} issues ${verb}.`,
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
  }, [
    archived,
    keepMonitoring,
    lifecycleGroup,
    project.id,
    searchQuery,
    selection,
    sorting.column,
    sorting.direction,
    timeRange,
  ])

  const handleBulkIgnore = useCallback(async () => {
    const bulkSelection = selection.bulkSelection
    if (!bulkSelection) return

    setBulkActionLoading(true)
    try {
      const result = await applyBulkSignalLifecycleAction({
        data: {
          projectId: project.id,
          selection: bulkSelection,
          command: archived ? "unignore" : "ignore",
          lifecycleGroup,
          sort: {
            field: sorting.column,
            direction: sorting.direction,
          },
          ...(assigneeIds.length > 0 ? { assigneeIds: [...assigneeIds] } : {}),
          ...(searchQuery ? { searchQuery } : {}),
          ...(timeRange ? { timeRange } : {}),
        },
      })
      const changedCount = result.items.filter((item) => item.changed).length
      const verb = archived ? "unignored" : "ignored"
      await invalidateSignalQueries(project.id)
      toast({
        description:
          changedCount === 0
            ? `No issues were ${verb}.`
            : changedCount === 1
              ? `1 issue ${verb}.`
              : `${changedCount} issues ${verb}.`,
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
  }, [archived, lifecycleGroup, project.id, searchQuery, selection, sorting.column, sorting.direction, timeRange])

  const hasActiveFilters =
    lifecycleGroup !== "active" || searchQuery !== "" || Boolean(timeFrom || timeTo) || assigneeIds.length > 0
  // Derived from the un-substituted data so a placeholder reload (which forces
  // `issues` to []) does not falsely trigger the empty state.
  const hasNoSignals = !hasAnySignals && !hasActiveFilters
  const showEmptyState = !showSkeletons && hasNoSignals

  if (isLoading && !hasAnySignals && !hasActiveFilters) {
    return (
      <Layout>
        <Layout.Content>
          <SignalsEmptyState isLoading />
        </Layout.Content>
      </Layout>
    )
  }

  if (showEmptyState) {
    return (
      <Layout>
        <Layout.Content>
          <SignalsEmptyState />
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
                startTimeFrom={timeFrom || timeRange.fromIso}
                {...(timeTo ? { startTimeTo: timeTo } : {})}
                onChange={(from, to) => {
                  setTimeFrom(from ?? "")
                  setTimeTo(to ?? "")
                }}
              />
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <ColumnsSelector
                columns={columnSettings.columns}
                selectedColumnIds={columnSettings.visibleColumnIds}
                onChange={(nextColumnIds) => columnSettings.setVisibleColumnIds(nextColumnIds as SignalsColumnId[])}
                onOrderChange={(nextColumnIds) => columnSettings.setColumnIds(nextColumnIds as SignalsColumnId[])}
              />
              <div className="relative">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search signals"
                  size="sm"
                  className="w-64 pl-8 rounded-lg"
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <AssigneeFilter value={assigneeIds} onChange={setAssigneeIds} />
              <Button
                variant={isMySignalsActive ? "secondary" : "outline"}
                size="sm"
                onClick={toggleMySignals}
                aria-pressed={isMySignalsActive}
              >
                <Icon icon={CircleUserRoundIcon} size="sm" />
                My signals
                <Badge variant={isMySignalsActive ? "default" : "muted"} size="small">
                  {mySignalsCount.toLocaleString()}
                </Badge>
              </Button>
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
              <Icon icon={archived ? PlayIcon : PauseIcon} size="sm" />
              {archived ? "Unignore" : "Ignore"} ({selection.selectedCount.toLocaleString()})
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
              <Icon icon={archived ? XIcon : CheckIcon} size="sm" />
              {archived ? "Unresolve" : "Resolve"} ({selection.selectedCount.toLocaleString()})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)} disabled={exporting}>
              <Icon icon={DownloadIcon} size="sm" />
              Export ({selection.selectedCount.toLocaleString()})
            </Button>
          </div>
        )}
        <div className="px-6">
          <SignalsAnalyticsPanel
            projectId={project.id}
            projectSlug={project.slug}
            analytics={analytics}
            isLoading={isAnalyticsLoading}
            onRangeSelect={(range) => {
              setTimeFrom(range?.from ?? "")
              setTimeTo(range?.to ?? "")
            }}
          />
        </div>
        <SignalsView
          issues={issues}
          rowMetricsBySignalId={rowMetricsBySignalId}
          isLoading={showSkeletons}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          occurrencesSum={occurrencesSum}
          priorityCounts={priorityCounts}
          visibleColumnIds={columnSettings.visibleColumnIds}
          selection={selection}
          onSortChange={setSorting}
          projectSlug={project.slug}
        />
        {selection.bulkSelection && (
          <ExportConfirmationModal
            open={exportModalOpen}
            onOpenChange={setExportModalOpen}
            itemLabel="signal"
            selectedCount={selection.selectedCount}
            onConfirm={() => void handleExportSignals()}
            exporting={exporting}
          />
        )}

        <Modal
          open={bulkResolveModalOpen}
          onOpenChange={setBulkResolveModalOpen}
          dismissible
          title={archived ? "Unresolve signals" : "Resolve signals"}
          description={
            archived
              ? `Reopen ${selection.selectedCount === 1 ? "this signal" : `${selection.selectedCount} signals`}. New occurrences won't mark ${selection.selectedCount === 1 ? "it" : "them"} as regressed.`
              : `Mark ${selection.selectedCount === 1 ? "this signal" : `${selection.selectedCount} signals`} as resolved. If any of these signals start occurring again we will alert you and promote them as regressed.`
          }
          footer={
            <>
              <Button variant="outline" onClick={() => setBulkResolveModalOpen(false)} disabled={bulkActionLoading}>
                Cancel
              </Button>
              <Button
                {...(archived ? { variant: "destructive" as const } : {})}
                onClick={() => void handleBulkResolve()}
                disabled={bulkActionLoading}
              >
                <Icon icon={archived ? XIcon : CheckIcon} size="sm" />
                {archived ? "Unresolve" : "Resolve"}{" "}
                {selection.selectedCount === 1 ? "Signal" : `${selection.selectedCount} Signals`}
              </Button>
            </>
          }
        >
          {!archived && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-row items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="bulk-keep-monitoring">Keep evaluating these signals</Label>
                  <Text.H6 color="foregroundMuted">
                    Evaluations for these signals will stay active to detect further regressions
                  </Text.H6>
                </div>
                <Switch
                  id="bulk-keep-monitoring"
                  checked={keepMonitoring}
                  onCheckedChange={setKeepMonitoring}
                  disabled={bulkActionLoading}
                  aria-label="Keep evaluating these signals"
                />
              </div>
            </div>
          )}
        </Modal>

        <Modal
          open={bulkIgnoreModalOpen}
          onOpenChange={setBulkIgnoreModalOpen}
          dismissible
          title={archived ? "Unignore signals" : "Ignore signals"}
          description={
            archived
              ? `Stop ignoring ${selection.selectedCount === 1 ? "this signal" : `${selection.selectedCount} signals`}. New occurrences will surface ${selection.selectedCount === 1 ? "it" : "them"} again.`
              : `Mark ${selection.selectedCount === 1 ? "this signal" : `${selection.selectedCount} signals`} as ignored. You won't be alerted about new occurrences of these signals anymore.`
          }
          footer={
            <>
              <CloseTrigger />
              <Button
                {...(archived ? {} : { variant: "destructive" as const })}
                onClick={() => void handleBulkIgnore()}
                disabled={bulkActionLoading}
              >
                <Icon icon={archived ? PlayIcon : PauseIcon} size="sm" />
                {archived ? "Unignore" : "Ignore"}{" "}
                {selection.selectedCount === 1 ? "Signal" : `${selection.selectedCount} Signals`}
              </Button>
            </>
          }
        />
      </Layout.Content>
    </Layout>
  )
}
