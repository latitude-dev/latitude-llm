import { Button, Icon, Input, Modal, toast, useValueWithDefault } from "@repo/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { BellOffIcon, BellPlusIcon, CheckIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { invalidateAllMonitorQueries, useMonitors } from "../../../../../../domains/monitors/monitors.collection.ts"
import {
  bulkDeleteMonitors,
  bulkMuteMonitors,
  bulkResolveMonitorLastIncidents,
} from "../../../../../../domains/monitors/monitors.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { useDebounce } from "../../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import {
  EMPTY_SELECTION,
  type SelectionState,
  useSelectableRows,
} from "../../../../../../lib/hooks/useSelectableRows.ts"
import { BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { MonitorCreateModal } from "./monitor-create-modal.tsx"
import { MonitorsEmptyState } from "./monitors-empty-state.tsx"
import { DEFAULT_MONITORS_SORTING, type MonitorsTableSorting, MonitorsView, sortMonitorRows } from "./monitors-view.tsx"

const MONITORS_SEARCH_DEBOUNCE_MS = 300

const SORT_COLUMNS = ["name", "status", "lastIncident"] as const satisfies readonly MonitorsTableSorting["column"][]
const SORT_DIRECTIONS = ["asc", "desc"] as const satisfies readonly MonitorsTableSorting["direction"][]
const SORT_PARAM_PATTERN = /^(name|status|lastIncident):(asc|desc)$/

function serializeSorting(sorting: MonitorsTableSorting): string {
  return `${sorting.column}:${sorting.direction}`
}

function parseSorting(raw: string): MonitorsTableSorting {
  const [column, direction] = raw.split(":")
  if (
    SORT_COLUMNS.includes(column as MonitorsTableSorting["column"]) &&
    SORT_DIRECTIONS.includes(direction as MonitorsTableSorting["direction"])
  ) {
    return {
      column: column as MonitorsTableSorting["column"],
      direction: direction as MonitorsTableSorting["direction"],
    }
  }
  return DEFAULT_MONITORS_SORTING
}

export function MonitorsBreadcrumb() {
  return <BreadcrumbText variant="current">Monitors</BreadcrumbText>
}

export function MonitorsListPage() {
  return <MonitorsPageContent />
}

function MonitorsPageContent() {
  const project = useRouteProject()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const openMonitor = useCallback(
    (slug: string) =>
      void navigate({
        to: "/projects/$projectSlug/monitors/$monitorSlug",
        params: { projectSlug: project.slug, monitorSlug: slug },
      }),
    [navigate, project.slug],
  )
  const [searchQuery, setSearchQuery] = useParamState("monitorsSearch", "")
  const [searchInput, setSearchInput] = useValueWithDefault(searchQuery)
  const [createOpen, setCreateOpen] = useState(false)
  const [rawSorting, setRawSorting] = useParamState("monitorsSort", serializeSorting(DEFAULT_MONITORS_SORTING), {
    validate: (value): value is string => SORT_PARAM_PATTERN.test(value),
  })
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const setSorting = useCallback((next: MonitorsTableSorting) => setRawSorting(serializeSorting(next)), [setRawSorting])
  const [selectionState, setSelectionState] = useState<SelectionState<string>>(EMPTY_SELECTION)
  const [bulkResolveModalOpen, setBulkResolveModalOpen] = useState(false)
  const [bulkMuteModalOpen, setBulkMuteModalOpen] = useState(false)
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  const paletteCommands = useMemo<readonly PaletteCommand[]>(
    () => [
      {
        id: "monitor:create",
        title: "Create monitor",
        icon: BellPlusIcon,
        section: "context",
        group: "Monitors",
        keywords: "create monitor new add alert",
        perform: () => setCreateOpen(true),
      },
    ],
    [],
  )
  useRegisterCommands(paletteCommands)

  useDebounce(
    () => {
      const normalized = searchInput.trim()
      if (normalized !== searchQuery) {
        setSearchQuery(normalized)
      }
    },
    MONITORS_SEARCH_DEBOUNCE_MS,
    [searchInput, searchQuery, setSearchQuery],
  )

  const { rows, totalCount, isLoading, isReloading, infiniteScroll } = useMonitors({
    projectId: project.id,
    system: false,
    ...(searchQuery ? { searchQuery } : {}),
  })

  const sortedRows = useMemo(() => sortMonitorRows(rows, sorting), [rows, sorting])

  const monitorIds = useMemo(() => sortedRows.map((row) => row.monitor.id), [sortedRows])
  const selection = useSelectableRows({
    rowIds: monitorIds,
    totalRowCount: totalCount,
    controlledState: selectionState,
    onStateChange: setSelectionState,
  })
  // Known from the loaded rows; an `all` selection may resolve more on the server.
  const selectionHasOngoingIncident = sortedRows.some(
    (row) => row.lastIncident?.endedAtIso === null && selection.isSelected(row.monitor.id),
  )

  const bulkActionData = useCallback(() => {
    const bulkSelection = selection.bulkSelection
    if (!bulkSelection) return null
    return {
      projectId: project.id,
      selection: bulkSelection,
      system: false,
      ...(searchQuery ? { searchQuery } : {}),
    }
  }, [project.id, searchQuery, selection])

  const handleBulkResolveIncidents = useCallback(async () => {
    const data = bulkActionData()
    if (!data) return
    setBulkActionLoading(true)
    try {
      const { resolvedCount } = await bulkResolveMonitorLastIncidents({ data })
      await invalidateAllMonitorQueries(queryClient, project.id)
      toast({
        description:
          resolvedCount === 0
            ? "No ongoing incidents to resolve."
            : resolvedCount === 1
              ? "1 incident resolved."
              : `${resolvedCount} incidents resolved.`,
      })
      selection.clearSelections()
      setBulkResolveModalOpen(false)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setBulkActionLoading(false)
    }
  }, [bulkActionData, project.id, queryClient, selection])

  const handleBulkMute = useCallback(async () => {
    const data = bulkActionData()
    if (!data) return
    setBulkActionLoading(true)
    try {
      const { mutedCount } = await bulkMuteMonitors({ data })
      await invalidateAllMonitorQueries(queryClient, project.id)
      toast({ description: mutedCount === 1 ? "1 monitor muted." : `${mutedCount} monitors muted.` })
      selection.clearSelections()
      setBulkMuteModalOpen(false)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setBulkActionLoading(false)
    }
  }, [bulkActionData, project.id, queryClient, selection])

  const handleBulkDelete = useCallback(async () => {
    const data = bulkActionData()
    if (!data) return
    setBulkActionLoading(true)
    try {
      const { deletedCount, skippedSystemCount } = await bulkDeleteMonitors({ data })
      await invalidateAllMonitorQueries(queryClient, project.id)
      toast({
        description: [
          deletedCount === 1 ? "1 monitor removed." : `${deletedCount} monitors removed.`,
          ...(skippedSystemCount > 0
            ? [`${skippedSystemCount} system ${skippedSystemCount === 1 ? "monitor" : "monitors"} skipped.`]
            : []),
        ].join(" "),
      })
      selection.clearSelections()
      setBulkDeleteModalOpen(false)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setBulkActionLoading(false)
    }
  }, [bulkActionData, project.id, queryClient, selection])

  const hasMonitors = totalCount > 0
  const hasActiveFilters = Boolean(searchQuery)
  const showEmptyState = !isLoading && !hasMonitors && !hasActiveFilters

  const createModal = createOpen ? (
    <MonitorCreateModal
      projectId={project.id}
      projectSlug={project.slug}
      onClose={() => setCreateOpen(false)}
      onCreated={openMonitor}
    />
  ) : null

  if (showEmptyState) {
    return (
      <Layout>
        <Layout.Content>
          <MonitorsEmptyState onCreate={() => setCreateOpen(true)} />
          {createModal}
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
              <div className="relative">
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search monitors"
                  size="sm"
                  className="w-64 pl-8 rounded-lg"
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Button onClick={() => setCreateOpen(true)}>
                <Icon icon={BellPlusIcon} size="sm" />
                Monitor
              </Button>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        {selection.selectedCount > 0 && (
          <div className="flex items-center gap-2 px-6">
            {selectionHasOngoingIncident && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkResolveModalOpen(true)}
                disabled={bulkActionLoading}
              >
                <Icon icon={CheckIcon} size="sm" />
                Resolve last incident
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setBulkMuteModalOpen(true)} disabled={bulkActionLoading}>
              <Icon icon={BellOffIcon} size="sm" />
              Mute ({selection.selectedCount.toLocaleString()})
            </Button>
            <Button
              variant="destructive-outline"
              size="sm"
              onClick={() => setBulkDeleteModalOpen(true)}
              disabled={bulkActionLoading}
            >
              <Icon icon={Trash2Icon} size="sm" />
              Remove ({selection.selectedCount.toLocaleString()})
            </Button>
          </div>
        )}
        <MonitorsView
          rows={sortedRows}
          isLoading={isLoading || isReloading}
          infiniteScroll={infiniteScroll}
          onActiveMonitorChange={(slug) => slug && openMonitor(slug)}
          projectId={project.id}
          projectSlug={project.slug}
          sorting={sorting}
          onSortChange={setSorting}
          selection={selection}
        />
        {createModal}

        <Modal
          open={bulkResolveModalOpen}
          onOpenChange={setBulkResolveModalOpen}
          dismissible
          title="Resolve ongoing incidents"
          description="Each selected monitor's ongoing incident will be closed and marked as resolved. If a monitor's condition triggers again, a new incident will be created."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkResolveModalOpen(false)} disabled={bulkActionLoading}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleBulkResolveIncidents()}
                disabled={bulkActionLoading}
                isLoading={bulkActionLoading}
              >
                <Icon icon={CheckIcon} size="sm" />
                Resolve
              </Button>
            </div>
          }
        />

        <Modal
          open={bulkMuteModalOpen}
          onOpenChange={setBulkMuteModalOpen}
          dismissible
          title={selection.selectedCount === 1 ? "Mute monitor" : "Mute monitors"}
          description={`${selection.selectedCount === 1 ? "The selected monitor" : `The ${selection.selectedCount} selected monitors`} will keep creating incidents, but ${selection.selectedCount === 1 ? "it" : "they"} will stop sending notifications`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkMuteModalOpen(false)} disabled={bulkActionLoading}>
                Cancel
              </Button>
              <Button onClick={() => void handleBulkMute()} disabled={bulkActionLoading} isLoading={bulkActionLoading}>
                <Icon icon={BellOffIcon} size="sm" />
                Mute
              </Button>
            </div>
          }
        />

        <Modal
          open={bulkDeleteModalOpen}
          onOpenChange={setBulkDeleteModalOpen}
          dismissible
          title={selection.selectedCount === 1 ? "Remove monitor" : "Remove monitors"}
          description={`Removing ${selection.selectedCount === 1 ? "this monitor" : `these ${selection.selectedCount} monitors`} cannot be undone. Existing incidents will stay in your history`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkDeleteModalOpen(false)} disabled={bulkActionLoading}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleBulkDelete()}
                disabled={bulkActionLoading}
                isLoading={bulkActionLoading}
              >
                Remove
              </Button>
            </div>
          }
        />
      </Layout.Content>
    </Layout>
  )
}
