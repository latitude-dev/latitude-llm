import { InfiniteTable } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/issues/")({
  component: IssuesPage,
})

function IssuesPage() {
  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem />
          </Layout.ActionsRow>
        </Layout.Actions>
        <Layout.List>
          <InfiniteTable data={[]} columns={[]} getRowKey={() => ""} blankSlate="There are no issues yet." />
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
