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
  DataTableTable,
  DataTableToolbar,
  TableBlankSlate,
  TableSkeleton,
  Text,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Database } from "lucide-react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
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
      <DataTableTable>
        <DataTableHeader>
          <DataTableHeaderRow>
            <DataTableHeaderCell indexColumn>#</DataTableHeaderCell>
            <DataTableHeaderCell>Name</DataTableHeaderCell>
            <DataTableHeaderCell>Description</DataTableHeaderCell>
            <DataTableHeaderCell>Last updated</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Rows</DataTableHeaderCell>
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
              <DataTableCell indexColumn>
                <Text.H6 color="foregroundMuted">{index + 1}</Text.H6>
              </DataTableCell>
              <DataTableCell>
                <Text.H5>{dataset.name}</Text.H5>
              </DataTableCell>
              <DataTableCell>
                <Text.H5 color="foregroundMuted">{dataset.description ?? "—"}</Text.H5>
              </DataTableCell>
              <DataTableCell>
                <Text.H5 color="foregroundMuted">{relativeTime(dataset.updatedAt)}</Text.H5>
              </DataTableCell>
              <DataTableCell align="right">
                <Text.H5 color="foregroundMuted">—</Text.H5>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTableTable>
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
            <DataTableSearch
              placeholder="Search datasets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
          <TableBlankSlate description={search.trim() ? "No datasets match your search." : "There are no datasets yet."} />
        )}
      </div>
    </Container>
  )
}
