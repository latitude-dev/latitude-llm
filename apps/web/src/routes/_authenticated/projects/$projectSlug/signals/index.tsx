import type { FilterSet } from "@domain/shared"
import {
  Button,
  CloseTrigger,
  DotIndicator,
  Icon,
  Input,
  Modal,
  Tabs,
  Tooltip,
  toast,
  useMountEffect,
  useValueWithDefault,
} from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, redirect, useParams } from "@tanstack/react-router"
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

import { ActivityIcon, ArchiveIcon, DownloadIcon, PauseIcon, PlayIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
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
import { TimeFilterDropdown } from "../-components/time-filter-dropdown.tsx"
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
  const [bulkMuteModalOpen, setBulkMuteModalOpen] = useState(false)
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

  const handleBulkMute = useCallback(async () => {
    const bulkSelection = selection.bulkSelection
    if (!bulkSelection) return

    setBulkActionLoading(true)
    try {
      const result = await applyBulkSignalLifecycleAction({
        data: {
          projectId: project.id,
          selection: bulkSelection,
          command: archived ? "unmute" : "mute",
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
      const verb = archived ? "unmuted" : "muted"
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
      setBulkMuteModalOpen(false)
    } catch (error) {
      toast({
        variant: "destructive",
        description: toUserMessage(error),
      })
    } finally {
      setBulkActionLoading(false)
    }
  }, [archived, lifecycleGroup, project.id, searchQuery, selection, sorting.column, sorting.direction, tw.listRange])

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
              <Button size="sm" onClick={() => openCreate(null)}>
                <Icon icon={PlusIcon} size="sm" />
                New signal
              </Button>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        {selection.selectedCount > 0 && (
          <div className="flex items-center gap-2 px-6">
            <Button variant="outline" size="sm" onClick={() => setBulkMuteModalOpen(true)} disabled={bulkActionLoading}>
              <Icon icon={archived ? PlayIcon : PauseIcon} size="sm" />
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
          keyboardNavEnabled={!builderOpen && !exportModalOpen && !bulkMuteModalOpen}
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
          open={bulkMuteModalOpen}
          onOpenChange={setBulkMuteModalOpen}
          dismissible
          title={archived ? "Unmute signals" : "Mute signals"}
          description={
            archived
              ? `Unmute ${selection.selectedCount === 1 ? "this signal" : `${selection.selectedCount} signals`}. New occurrences can trigger notifications again.`
              : `Mute ${selection.selectedCount === 1 ? "this signal" : `${selection.selectedCount} signals`}. New occurrences will not trigger signal notifications.`
          }
          footer={
            <>
              <CloseTrigger />
              <Button
                {...(archived ? {} : { variant: "destructive" as const })}
                onClick={() => void handleBulkMute()}
                disabled={bulkActionLoading}
              >
                <Icon icon={archived ? PlayIcon : PauseIcon} size="sm" />
                {archived ? "Unmute" : "Mute"}{" "}
                {selection.selectedCount === 1 ? "Signal" : `${selection.selectedCount} Signals`}
              </Button>
            </>
          }
        />

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
