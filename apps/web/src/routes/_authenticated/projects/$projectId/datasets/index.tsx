import { Container, TableBlankSlate, TableWithHeader } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/projects/$projectId/datasets/")({
  component: DatasetsPage,
})

function DatasetsPage() {
  return (
    <Container className="pt-14">
      <TableWithHeader
        title="Datasets"
        table={<TableBlankSlate description="Datasets will appear here once you create them." />}
      />
    </Container>
  )
}
