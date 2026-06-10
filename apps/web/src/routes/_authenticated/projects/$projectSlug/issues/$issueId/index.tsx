import { Button, CopyableText, Skeleton, TagList, Text, Tooltip } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { useState } from "react"
import { useIssueDetail } from "../../../../../../domains/issues/issues.collection.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { IssueDetailBody } from "../-components/issue-detail-drawer.tsx"
import { IssueLifecycleActions } from "../-components/issue-lifecycle-actions.tsx"
import { IssueLifecycleStatuses } from "../-components/issue-lifecycle-statuses.tsx"
import { IssueExamples } from "./-components/issue-examples.tsx"
import { IssueNeighborNav } from "./-components/issue-neighbor-nav.tsx"
import { IssuePatterns } from "./-components/issue-patterns.tsx"
import { IssueRelated } from "./-components/issue-related.tsx"
import { IssueSummary } from "./-components/issue-summary.tsx"
import { IssueTriageControls } from "./-components/issue-triage-controls.tsx"

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
  const { data: issue, isLoading } = useIssueDetail({ projectId: project.id, issueId })
  // A trace sheet (from Examples or the Traces table) being open suppresses the
  // J/K prev/next-issue hotkeys so paging a trace never swaps the issue under it.
  const [overlayActive, setOverlayActive] = useState(false)
  // Cycle prev/next over the issue's own lifecycle group so opening an archived
  // issue still finds neighbors (the active default list wouldn't contain it).
  const lifecycleGroup = issue && (issue.resolvedAt !== null || issue.ignoredAt !== null) ? "archived" : "active"

  return (
    <Layout>
      <Layout.Content>
        <Layout.Header
          title={
            <div className="flex min-w-0 flex-row items-center gap-3">
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
                <>
                  <Text.H4M className="min-w-0 truncate">{issue?.name ?? "Issue not found"}</Text.H4M>
                  {issue && issue.states.length > 0 ? (
                    <div className="shrink-0">
                      <IssueLifecycleStatuses states={issue.states} />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          }
          description={
            !isLoading && issue ? (
              <div className="flex max-w-max">
                <CopyableText value={issue.slug} size="sm" ellipsis tooltip="Copy issue slug" />
              </div>
            ) : undefined
          }
          actions={
            <>
              <IssueNeighborNav
                projectId={project.id}
                projectSlug={projectSlug}
                issueId={issueId}
                lifecycleGroup={lifecycleGroup}
                overlayActive={overlayActive}
              />
              <div className="mx-1 h-5 w-px bg-border" />
              <IssueTriageControls projectId={project.id} issueId={issueId} compact />
              <IssueLifecycleActions projectId={project.id} issueId={issueId} compact />
            </>
          }
        />
        <IssueDetailBody
          projectId={project.id}
          issueId={issueId}
          variant="page"
          onOverlayActiveChange={setOverlayActive}
          prepend={
            <>
              <div className="flex min-w-0 flex-col gap-2">
                {isLoading ? (
                  <Skeleton className="h-5 w-full" />
                ) : (
                  <Text.H5 color="foregroundMuted">{issue?.description ?? "This issue could not be loaded."}</Text.H5>
                )}
                {!isLoading && issue && issue.tags.length > 0 ? <TagList tags={issue.tags} wrap /> : null}
              </div>
              <IssueSummary projectId={project.id} issueId={issueId} />
            </>
          }
          trendAside={<IssuePatterns projectId={project.id} issueId={issueId} />}
          beforeTraces={
            <>
              <IssueRelated projectId={project.id} projectSlug={projectSlug} issueId={issueId} />
              <IssueExamples projectId={project.id} issueId={issueId} onOverlayActiveChange={setOverlayActive} />
            </>
          }
        />
      </Layout.Content>
    </Layout>
  )
}
