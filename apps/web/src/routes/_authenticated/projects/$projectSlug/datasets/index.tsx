import { generateId } from "@domain/shared"
import {
  Button,
  DatabaseAddIcon,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  type SortDirection,
  Tooltip,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { useDatasetsInfiniteScroll } from "../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRecord } from "../../../../../domains/datasets/datasets.functions.ts"
import { createDatasetMutation } from "../../../../../domains/datasets/datasets.mutations.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/datasets/")({
  component: DatasetsPage,
})

const DEFAULT_SORTING: InfiniteTableSorting = {
  column: "updatedAt",
  direction: "desc",
}

const columns: InfiniteTableColumn<DatasetRecord>[] = [
  {
    key: "name",
    header: "Name",
    sortKey: "name",
    render: (d) => d.name,
  },
  {
    key: "description",
    header: "Description",
    render: (d) => d.description ?? "—",
  },
  {
    key: "updatedAt",
    header: "Last updated",
    sortKey: "updatedAt",
    render: (d) => (
      <Tooltip trigger={relativeTime(new Date(d.updatedAt))}>{new Date(d.updatedAt).toLocaleString()}</Tooltip>
    ),
  },
]

function DatasetsPage() {
  const { projectSlug } = Route.useParams()
  const navigate = Route.useNavigate()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const [sortBy, setSortBy] = useParamState("sortBy", DEFAULT_SORTING.column)
  const [sortDirection, setSortDirection] = useParamState("sortDirection", DEFAULT_SORTING.direction, {
    validate: (v): v is SortDirection => v === "asc" || v === "desc",
  })
  const sorting: InfiniteTableSorting = { column: sortBy, direction: sortDirection }

  const handleSortChange = (next: InfiniteTableSorting) => {
    setSortBy(next.column)
    setSortDirection(next.direction)
  }

  const {
    data: datasets,
    isLoading,
    infiniteScroll,
  } = useDatasetsInfiniteScroll({
    projectId: project?.id ?? "",
    sorting,
  })

  const getRowKey = useCallback((d: DatasetRecord) => d.id, [])
  const onRowClick = useCallback(
    (d: DatasetRecord) =>
      navigate({
        to: "/projects/$projectSlug/datasets/$datasetId",
        params: { projectSlug, datasetId: d.id },
      }),
    [navigate, projectSlug],
  )

  const handleCreate = useCallback(async () => {
    if (!project) return
    setCreating(true)
    try {
      const datasetId = generateId()
      await createDatasetMutation({
        id: datasetId,
        projectId: project.id,
        name: `Dataset ${new Date().toLocaleString()}`,
      })
      navigate({
        to: "/projects/$projectSlug/datasets/$datasetId",
        params: { projectSlug, datasetId },
      })
    } catch (err) {
      toast({ variant: "destructive", description: toUserMessage(err) })
    } finally {
      setCreating(false)
    }
  }, [project, projectSlug, navigate, toast])

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem />
            <Layout.ActionRowItem>
              <Button variant="outline" onClick={handleCreate} disabled={creating} isLoading={creating}>
                <Icon size="sm" icon={DatabaseAddIcon} />
                Dataset
              </Button>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <Layout.List>
          <InfiniteTable
            data={datasets}
            isLoading={isLoading}
            columns={columns}
            getRowKey={getRowKey}
            onRowClick={onRowClick}
            infiniteScroll={infiniteScroll}
            sorting={sorting}
            defaultSorting={DEFAULT_SORTING}
            onSortChange={handleSortChange}
            blankSlate="There are no datasets yet."
          />
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
