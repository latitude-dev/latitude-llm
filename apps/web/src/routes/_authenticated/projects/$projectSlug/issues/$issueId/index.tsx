import { Button, Skeleton, Text, Tooltip } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { useHasFeatureFlag } from "../../../../../../domains/feature-flags/feature-flags.collection.ts"
import { useIssueDetail } from "../../../../../../domains/issues/issues.collection.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { IssueDetailBody } from "../-components/issue-detail-drawer.tsx"
import { IssueLifecycleActions } from "../-components/issue-lifecycle-actions.tsx"
import { IssuePatterns } from "./-components/issue-patterns.tsx"
import { IssueSummary } from "./-components/issue-summary.tsx"

const issueDetailRoute = getRouteApi("/_authenticated/projects/$projectSlug/issues/$issueId/")

function IssueDetailBreadcrumb() {
  const { projectSlug, issueId } = issueDetailRoute.useParams()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.slug, projectSlug ?? "")).findOne(),
    [projectSlug],
  )
  const { data: issue } = useIssueDetail({ projectId: project?.id ?? "", issueId, enabled: Boolean(project?.id) })

  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/issues" params={{ projectSlug }}>
        Issues
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">{issue?.name ?? "Issue"}</BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/issues/$issueId/")({
  staticData: {
    breadcrumb: IssueDetailBreadcrumb,
  },
  component: IssueDetailPage,
})

function IssueDetailPage() {
  const { projectSlug, issueId } = Route.useParams()
  const project = useRouteProject()
  const hasIssuePage = useHasFeatureFlag("issue-page")
  const { data: issue, isLoading } = useIssueDetail({ projectId: project.id, issueId })

  if (!hasIssuePage) {
    return (
      <Layout>
        <Layout.Content>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
            <Text.H4M>This page isn't available</Text.H4M>
            <Link to="/projects/$projectSlug/issues" params={{ projectSlug }} className="underline">
              <Text.H5 color="primary">Back to issues</Text.H5>
            </Link>
          </div>
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout>
      <Layout.Content>
        <Layout.Header
          title={
            <div className="flex min-w-0 flex-row items-center gap-2">
              <Tooltip
                asChild
                side="bottom"
                trigger={
                  <Button asChild variant="ghost" className="h-8 w-8 p-0" aria-label="Back to issues">
                    <Link to="/projects/$projectSlug/issues" params={{ projectSlug }}>
                      <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </Button>
                }
              >
                Back to issues
              </Tooltip>
              {isLoading ? (
                <Skeleton className="h-7 w-56" />
              ) : (
                <Text.H4M className="min-w-0 truncate">{issue?.name ?? "Issue not found"}</Text.H4M>
              )}
            </div>
          }
          description={isLoading ? undefined : (issue?.description ?? "This issue could not be loaded.")}
          actions={<IssueLifecycleActions projectId={project.id} issueId={issueId} />}
        />
        <div className="px-6">
          <IssueSummary projectId={project.id} issueId={issueId} />
        </div>
        <IssueDetailBody
          projectId={project.id}
          issueId={issueId}
          variant="page"
          prepend={<IssuePatterns projectId={project.id} issueId={issueId} />}
        />
      </Layout.Content>
    </Layout>
  )
}
