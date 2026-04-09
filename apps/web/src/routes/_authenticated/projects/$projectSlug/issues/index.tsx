import { InfiniteTable, type InfiniteTableColumn, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { useIssuesCollection } from "../../../../../domains/issues/issues.collection.ts"
import type { IssueRecord } from "../../../../../domains/issues/issues.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { IssueEvaluationActions } from "./-components/issue-evaluation-actions.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/issues/")({
  component: IssuesPage,
})

function IssuesPage() {
  const { project } = Route.useRouteContext()
  const { data, isLoading } = useIssuesCollection(project.id)
  const issues = data ?? []
  const columns = useMemo(
    (): InfiniteTableColumn<IssueRecord>[] => [
      {
        key: "name",
        header: "Name",
        width: 240,
        render: (issue) => <Text.H5M>{issue.name}</Text.H5M>,
      },
      {
        key: "description",
        header: "Description",
        width: 360,
        render: (issue) => <Text.H6 color="foregroundMuted">{issue.description || "—"}</Text.H6>,
      },
      {
        key: "evaluations",
        header: "Evaluations",
        minWidth: 360,
        render: (issue) => (
          <IssueEvaluationActions projectId={project.id} issueId={issue.id} evaluations={issue.evaluations} />
        ),
      },
    ],
    [project.id],
  )

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem />
          </Layout.ActionsRow>
        </Layout.Actions>
        <Layout.List>
          <InfiniteTable
            data={issues}
            isLoading={isLoading}
            columns={columns}
            getRowKey={(issue) => issue.id}
            blankSlate="There are no issues yet."
          />
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
