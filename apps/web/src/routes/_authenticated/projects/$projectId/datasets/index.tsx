import {
  Button,
  Container,
  DataTableBody,
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableHeaderRow,
  DataTableRoot,
  DataTableRow,
  DataTableSearch,
  DataTableToolbar,
  TableBlankSlate,
  TableSkeleton,
  Text,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Database } from "lucide-react"
import { useCallback, useState } from "react"
import { useDatasetsCollection } from "../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRecord } from "../../../../../domains/datasets/datasets.functions.ts"
import { createDatasetMutation } from "../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId/datasets/")({
  component: DatasetsPage,
})

function DatasetsTable({ datasets, projectId }: { datasets: DatasetRecord[]; projectId: string }) {
  const navigate = useNavigate()
  return (
    <DataTableRoot>
      <DataTableHeader>
        <DataTableHeaderRow>
          <DataTableHeaderCell>#</DataTableHeaderCell>
          <DataTableHeaderCell sortable>Name</DataTableHeaderCell>
          <DataTableHeaderCell>Description</DataTableHeaderCell>
          <DataTableHeaderCell>Last updated</DataTableHeaderCell>
        </DataTableHeaderRow>
      </DataTableHeader>
      <DataTableBody>
        {datasets.map((dataset, index) => (
          <DataTableRow
            key={dataset.id}
            className="cursor-pointer"
            onClick={() =>
              navigate({
                to: "/projects/$projectId/datasets/$datasetId",
                params: { projectId, datasetId: dataset.id },
              })
            }
          >
            <DataTableCell textSize="sm" textColor="muted">
              #{index + 1}
            </DataTableCell>
            <DataTableCell>{dataset.name}</DataTableCell>
            <DataTableCell>{dataset.description ?? "—"}</DataTableCell>
            <DataTableCell>{relativeTime(dataset.updatedAt)}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTableRoot>
  )
}

function DatasetsPage() {
  const { projectId } = Route.useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const datasetsCollection = useDatasetsCollection(projectId)
  const datasets = datasetsCollection.data ?? []
  const isLoading = !datasetsCollection.data
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState("")

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const dataset = await createDatasetMutation({
        data: { projectId, name: `Dataset ${new Date().toLocaleString()}` },
      })
      getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
      navigate({
        to: "/projects/$projectId/datasets/$datasetId",
        params: { projectId, datasetId: dataset.id },
      })
    } catch (err) {
      toast({ variant: "destructive", description: toUserMessage(err) })
    } finally {
      setCreating(false)
    }
  }, [projectId, navigate, toast])

  const filteredDatasets = search.trim()
    ? datasets.filter(
      (d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.description?.toLowerCase().includes(search.toLowerCase()) ?? false),
    )
    : datasets

  return (
    <Container className="pt-14">
      <div className="flex flex-col gap-4">
        <DataTableToolbar
          left={
            <DataTableSearch placeholder="Search datasets" value={search} onChange={(e) => setSearch(e.target.value)} />
          }
          right={
            <Button
              variant="primaryMuted"
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              isLoading={creating}
              iconProps={{ icon: Database, size: "sm" }}
            >
              Create dataset
            </Button>
          }
        />
        {isLoading ? (
          <TableSkeleton cols={5} rows={3} />
        ) : filteredDatasets.length > 0 ? (
          <DatasetsTable datasets={filteredDatasets} projectId={projectId} />
        ) : (
          <TableBlankSlate
            description={search.trim() ? "No datasets match your search." : "There are no datasets yet."}
          />
        )}
      </div>
    </Container>
  )
}
