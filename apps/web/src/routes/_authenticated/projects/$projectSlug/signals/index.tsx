import type { FilterSet } from "@domain/shared"
import {
  Button,
  CloseTrigger,
  DotIndicator,
  Icon,
  Input,
  Modal,
  Switch,
  Tabs,
  Text,
  Tooltip,
  toast,
  useMountEffect,
  useValueWithDefault,
} from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { useProjectFlaggers } from "../../../../../domains/flaggers/flaggers.collection.ts"
import { defaultProjectTimeWindowDays } from "../../../../../domains/projects/default-time-window.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { useAnalyticsTimeWindow } from "../../../../../domains/projects/use-analytics-time-window.ts"
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
  BellIcon,
  BellOffIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  SearchIcon,
  UndoIcon,
} from "lucide-react"

type BulkLifecycleAction = "resolve" | "unresolve" | "ignore" | "unignore" | "mute" | "unmute"

const BULK_LIFECYCLE_VERBS: Record<BulkLifecycleAction, string> = {
  resolve: "resolved",
  unresolve: "reopened",
  ignore: "ignored",
  unignore: "unignored",
  mute: "muted",
  unmute: "unmuted",
}

const BULK_LIFECYCLE_MODAL: Record<
  BulkLifecycleAction,
  {
    readonly title: string
    readonly label: string
    readonly icon: typeof CheckIcon
    readonly destructive: boolean
    readonly description: (target: string) => string
  }
> = {
  resolve: {
    title: "Resolve signals",
    label: "Resolve",
    icon: CheckIcon,
    destructive: false,
    description: (target) =>
      `Mark ${target} as resolved. If a signal starts occurring again we will alert you and promote it as regressed.`,
  },
  unresolve: {
    title: "Unresolve signals",
    label: "Unresolve",
    icon: UndoIcon,
    destructive: false,
    description: (target) => `Reopen ${target}. New occurrences won't mark them as regressed.`,
  },
  ignore: {
    title: "Ignore signals",
    label: "Ignore",
    icon: EyeOffIcon,
    destructive: true,
    description: (target) => `Mark ${target} as ignored. We won't monitor or alert you about new occurrences anymore.`,
  },
  unignore: {
    title: "Unignore signals",
    label: "Unignore",
    icon: EyeIcon,
    destructive: false,
    description: (target) => `Stop ignoring ${target}. New occurrences will surface them again.`,
  },
  mute: {
    title: "Mute signals",
    label: "Mute",
    icon: BellOffIcon,
    destructive: true,
    description: (target) =>
      `Silence ${target}. New occurrences still start incidents, but they won't send notifications.`,
  },
  unmute: {
    title: "Unmute signals",
    label: "Unmute",
    icon: BellIcon,
    destructive: false,
    description: (target) => `Unmute ${target}. New occurrences will be notified again.`,
  },
}

import { useCallback, useEffect, useMemo, useState } from "react"
import { TimeFilterDropdown } from "../../../../../components/time-filter-dropdown.tsx"
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
import { ExportConfirmationModal } from "../-components/export-confirmation-modal.tsx"
import { parseFilters } from "../-components/trace-page-state.ts"
import { useRouteProject } from "../-route-data.ts"
import { AssigneeFilter, UNASSIGNED_FILTER_TOKEN } from "./-components/assignee-filter.tsx"
import { SignalBuilderModal } from "./-components/builder/signal-builder-modal.tsx"
import { SignalsAnalyticsPanel } from "./-components/signals-analytics-panel.tsx"
import { SignalsEmptyState } from "./-components/signals-empty-state.tsx"
import { type SignalsTableSorting, SignalsView } from "./-components/signals-view.tsx"

const DEFAULT_SORTING: SignalsTableSorting = { column: "lastSeen", direction: "desc" }
const SIGNAL_SEARCH_DEBOUNCE_MS = 300
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
  // List search params (lifecycle/time/search/sort) live in the URL via `useParamState`,
  // so keep a permissive passthrough rather than a typed schema.
  validateSearch: (search: Record<string, unknown>): Record<string, unknown> => search,
  staticData: {
    breadcrumb: SignalsBreadcrumb,
  },
  component: SignalsPage,
})

function SignalsPage() {
  const project = useRouteProject()
  const [lifecycleGroup, setLifecycleGroup] = useParamState("signalsLifecycle", "active", {
    validate: (value): value is "active" | "archived" => value === "active" || value === "archived",
  })
  const tw = useAnalyticsTimeWindow({
    project,
    fromKey: "signalsTimeFrom",
    toKey: "signalsTimeTo",
  })
  const [assigneesParam, setAssigneesParam] = useParamState("signalsAssignees", "")
  const [searchQuery, setSearchQuery] = useParamState("signalsSearch", "")
  const [searchInput, setSearchInput] = useValueWithDefault(searchQuery)
  const [rawSorting, setRawSorting] = useParamState("signalsSort", serializeSorting(DEFAULT_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const setSorting = useCallback((next: SignalsTableSorting) => setRawSorting(serializeSorting(next)), [setRawSorting])
  const archived = lifecycleGroup === "archived"
  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [bulkLifecycleAction, setBulkLifecycleAction] = useState<BulkLifecycleAction | null>(null)
  const [bulkKeepMonitoring, setBulkKeepMonitoring] = useState(true)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderInitialFilters, setBuilderInitialFilters] = useState<FilterSet | null>(null)
  const [focusedSignalId, setFocusedSignalId] = useState<string | undefined>()
  const [newSignalParam, setNewSignalParam] = useParamState("newSignal", "")
  const [newSignalFiltersParam, setNewSignalFiltersParam] = useParamState("newSignalFilters", "")

  const openCreate = useCallback((filters: FilterSet | null) => {
    setBuilderInitialFilters(filters)
    setBuilderOpen(true)
  }, [])

  // "Create signal from this search" lands here with the search's filters in the URL: open the
  // builder pre-filled, then strip the params so a refresh doesn't reopen it.
  useMountEffect(() => {
    if (newSignalParam !== "1") return
    openCreate(parseFilters(newSignalFiltersParam || undefined))
    setNewSignalParam("")
    setNewSignalFiltersParam("")
  })

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

  useEffect(() => {
    setFocusedSignalId(undefined)
  }, [lifecycleGroup, searchQuery, rawSorting, assigneesParam, tw.timeFrom, tw.timeTo])

  const assigneeIds = useMemo(() => parseAssignees(assigneesParam), [assigneesParam])
  const setAssigneeIds = useCallback(
    (next: readonly string[]) => setAssigneesParam(serializeAssignees(next)),
    [setAssigneesParam],
  )

  const {
    data: signalsData,
    rowMetricsBySignalId,
    analytics,
    occurrencesSum,
    priorityCounts,
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
    timeRange: tw.listRange,
    histogramMaxSpanDays: defaultProjectTimeWindowDays(project),
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
          timeRange: tw.listRange,
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
  }, [lifecycleGroup, project.id, searchQuery, selection, sorting.column, sorting.direction, tw.listRange])

  const handleBulkLifecycle = useCallback(
    async (command: BulkLifecycleAction, keepMonitoring?: boolean) => {
      const bulkSelection = selection.bulkSelection
      if (!bulkSelection) return

      setBulkActionLoading(true)
      try {
        const result = await applyBulkSignalLifecycleAction({
          data: {
            projectId: project.id,
            selection: bulkSelection,
            command,
            ...(command === "resolve" && keepMonitoring !== undefined ? { keepMonitoring } : {}),
            lifecycleGroup,
            sort: {
              field: sorting.column,
              direction: sorting.direction,
            },
            ...(assigneeIds.length > 0 ? { assigneeIds: [...assigneeIds] } : {}),
            ...(searchQuery ? { searchQuery } : {}),
            timeRange: tw.listRange,
          },
        })
        const changedCount = result.items.filter((item) => item.changed).length
        const verb = BULK_LIFECYCLE_VERBS[command]
        await invalidateSignalQueries(project.id)
        toast({
          description:
            changedCount === 0
              ? `No signals were ${verb}.`
              : changedCount === 1
                ? `1 signal ${verb}.`
                : `${changedCount} signals ${verb}.`,
        })
        selection.clearSelections()
        setBulkLifecycleAction(null)
      } catch (error) {
        toast({
          variant: "destructive",
          description: toUserMessage(error),
        })
      } finally {
        setBulkActionLoading(false)
      }
    },
    [assigneeIds, lifecycleGroup, project.id, searchQuery, selection, sorting.column, sorting.direction, tw.listRange],
  )

  const hasActiveFilters =
    lifecycleGroup !== "active" || searchQuery !== "" || tw.hasExplicitRange || assigneeIds.length > 0
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
          <SignalsEmptyState onCreate={() => openCreate(null)} />
          {builderOpen ? (
            <SignalBuilderModal
              projectId={project.id}
              projectSlug={project.slug}
              mode="create"
              initialFilters={builderInitialFilters}
              onClose={() => setBuilderOpen(false)}
            />
          ) : null}
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
                {...(tw.pickerStartFrom ? { startTimeFrom: tw.pickerStartFrom } : {})}
                {...(tw.pickerStartTo ? { startTimeTo: tw.pickerStartTo } : {})}
                onChange={tw.onTimeChange}
              />
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
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
              <Button onClick={() => openCreate(null)}>
                <Icon icon={PlusIcon} size="sm" />
                Signal
              </Button>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        {selection.selectedCount > 0 && (
          <div className="flex items-center gap-2 px-6">
            {(archived ? (["unresolve", "unignore"] as const) : (["resolve", "ignore"] as const)).map((action) => (
              <Button
                key={action}
                variant="outline"
                size="sm"
                onClick={() => {
                  if (action === "resolve") setBulkKeepMonitoring(true)
                  setBulkLifecycleAction(action)
                }}
                disabled={bulkActionLoading}
              >
                <Icon icon={BULK_LIFECYCLE_MODAL[action].icon} size="sm" />
                {BULK_LIFECYCLE_MODAL[action].label} ({selection.selectedCount.toLocaleString()})
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkLifecycleAction(archived ? "unmute" : "mute")}
              disabled={bulkActionLoading}
            >
              <Icon icon={archived ? BellIcon : BellOffIcon} size="sm" />
              {archived ? "Unmute" : "Mute"} ({selection.selectedCount.toLocaleString()})
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
            isAllTime={tw.isAllTime}
            onRangeSelect={tw.onBrushSelect}
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
          selection={selection}
          onSortChange={setSorting}
          projectSlug={project.slug}
          focusedSignalId={focusedSignalId}
          onFocusedSignalChange={setFocusedSignalId}
          keyboardNavEnabled={!builderOpen && !exportModalOpen && bulkLifecycleAction === null}
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

        {bulkLifecycleAction !== null ? (
          <Modal
            open
            onOpenChange={(open) => {
              if (!open) setBulkLifecycleAction(null)
            }}
            dismissible
            title={BULK_LIFECYCLE_MODAL[bulkLifecycleAction].title}
            description={BULK_LIFECYCLE_MODAL[bulkLifecycleAction].description(
              selection.selectedCount === 1 ? "this signal" : `${selection.selectedCount} signals`,
            )}
            footer={
              <>
                <CloseTrigger />
                <Button
                  {...(BULK_LIFECYCLE_MODAL[bulkLifecycleAction].destructive
                    ? { variant: "destructive" as const }
                    : {})}
                  onClick={() =>
                    void handleBulkLifecycle(
                      bulkLifecycleAction,
                      bulkLifecycleAction === "resolve" ? bulkKeepMonitoring : undefined,
                    )
                  }
                  disabled={bulkActionLoading}
                >
                  <Icon icon={BULK_LIFECYCLE_MODAL[bulkLifecycleAction].icon} size="sm" />
                  {BULK_LIFECYCLE_MODAL[bulkLifecycleAction].label}{" "}
                  {selection.selectedCount === 1 ? "Signal" : `${selection.selectedCount} Signals`}
                </Button>
              </>
            }
          >
            {bulkLifecycleAction === "resolve" ? (
              <div className="flex items-start gap-3">
                <Switch
                  checked={bulkKeepMonitoring}
                  onCheckedChange={setBulkKeepMonitoring}
                  disabled={bulkActionLoading}
                />
                <div className="flex flex-col gap-1">
                  <Text.H6>Keep evaluating these signals</Text.H6>
                  <Text.H6 color="foregroundMuted">
                    {bulkKeepMonitoring
                      ? "Their evaluations keep running so regressions reopen them."
                      : "Their evaluations will be archived; regressions won't be detected."}
                  </Text.H6>
                </div>
              </div>
            ) : null}
          </Modal>
        ) : null}

        {builderOpen ? (
          <SignalBuilderModal
            projectId={project.id}
            projectSlug={project.slug}
            mode="create"
            initialFilters={builderInitialFilters}
            onClose={() => setBuilderOpen(false)}
          />
        ) : null}
      </Layout.Content>
    </Layout>
  )
}
