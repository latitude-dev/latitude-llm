import { Button, Icon, Input, useValueWithDefault } from "@repo/ui"
import { FlaskConical, PlusIcon, SearchIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useRegisterCommands } from "../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../components/command-palette/types.ts"
import { useExperiments } from "../../../../../../domains/experiments/experiments.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useDebounce } from "../../../../../../lib/hooks/useDebounce.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { ExperimentCreateModal } from "./experiment-modals.tsx"
import { ExperimentsEmptyState } from "./experiments-empty-state.tsx"
import { type ExperimentsSorting, ExperimentsView, sortExperimentRows } from "./experiments-view.tsx"

const EXPERIMENTS_SEARCH_DEBOUNCE_MS = 300
const SORT_PARAM_PATTERN = /^(name|variants|sessions|users):(asc|desc)$/

function parseSorting(raw: string): ExperimentsSorting | null {
  if (!SORT_PARAM_PATTERN.test(raw)) return null
  const [column, direction] = raw.split(":")
  return { column: column as ExperimentsSorting["column"], direction: direction as ExperimentsSorting["direction"] }
}

export function ExperimentsBreadcrumb() {
  return <BreadcrumbText variant="current">Experiments</BreadcrumbText>
}

export function ExperimentsListPage() {
  const project = useRouteProject()
  const [searchQuery, setSearchQuery] = useParamState("experimentsSearch", "")
  const [searchInput, setSearchInput] = useValueWithDefault(searchQuery)
  const [createOpen, setCreateOpen] = useState(false)
  const [rawSorting, setRawSorting] = useParamState("experimentsSort", "")
  const sorting = useMemo(() => parseSorting(rawSorting), [rawSorting])
  const setSorting = useCallback(
    (next: ExperimentsSorting) => setRawSorting(`${next.column}:${next.direction}`),
    [setRawSorting],
  )

  const paletteCommands = useMemo<readonly PaletteCommand[]>(
    () => [
      {
        id: "experiment:create",
        title: "Create experiment",
        icon: FlaskConical,
        section: "context",
        group: "Experiments",
        keywords: "create experiment new add compare variant",
        perform: () => setCreateOpen(true),
      },
    ],
    [],
  )
  useRegisterCommands(paletteCommands)

  useDebounce(
    () => {
      const normalized = searchInput.trim()
      if (normalized !== searchQuery) setSearchQuery(normalized)
    },
    EXPERIMENTS_SEARCH_DEBOUNCE_MS,
    [searchInput, searchQuery, setSearchQuery],
  )

  const { rows, totalCount, isLoading, isReloading, infiniteScroll } = useExperiments({
    projectId: project.id,
    ...(searchQuery ? { searchQuery } : {}),
  })

  const sortedRows = useMemo(() => sortExperimentRows(rows, sorting), [rows, sorting])

  const hasExperiments = totalCount > 0
  const showEmptyState = !isLoading && !hasExperiments && !searchQuery

  const createModal = createOpen ? (
    <ExperimentCreateModal projectId={project.id} projectSlug={project.slug} onClose={() => setCreateOpen(false)} />
  ) : null

  if (showEmptyState) {
    return (
      <Layout>
        <Layout.Content>
          <ExperimentsEmptyState onCreate={() => setCreateOpen(true)} />
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
                  placeholder="Search experiments"
                  size="sm"
                  className="w-64 pl-8 rounded-lg"
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <Button onClick={() => setCreateOpen(true)}>
                <Icon icon={PlusIcon} size="sm" />
                Experiment
              </Button>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <ExperimentsView
          rows={sortedRows}
          isLoading={isLoading || isReloading}
          infiniteScroll={infiniteScroll}
          projectId={project.id}
          projectSlug={project.slug}
          sorting={sorting}
          onSortChange={setSorting}
        />
        {createModal}
      </Layout.Content>
    </Layout>
  )
}
