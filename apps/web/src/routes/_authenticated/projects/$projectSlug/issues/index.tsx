import { Container, TableBlankSlate, TableWithHeader } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/issues/")({
  component: IssuesPage,
})

function IssuesPage() {
  return (
    <Container className="pt-14">
      <TableWithHeader
        title="Issues"
        table={<TableBlankSlate description="Issues will appear here once your agents start reporting them." />}
      />
    </Container>
  )
}
