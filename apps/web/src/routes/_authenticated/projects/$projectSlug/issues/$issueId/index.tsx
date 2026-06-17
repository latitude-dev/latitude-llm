import { Button, CopyableText, Skeleton, TagList, Text, Tooltip } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { useState } from "react"
import { useSignalDetail } from "../../../../../../domains/issues/issues.collection.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { SignalDetailBody } from "../-components/issue-detail-drawer.tsx"
import { SignalLifecycleActions } from "../-components/issue-lifecycle-actions.tsx"
import { SignalLifecycleStatuses } from "../-components/issue-lifecycle-statuses.tsx"
import { SignalExamples } from "./-components/issue-examples.tsx"
import { SignalNeighborNav } from "./-components/issue-neighbor-nav.tsx"
import { SignalPatterns } from "./-components/issue-patterns.tsx"
import { SignalRelated } from "./-components/issue-related.tsx"
import { SignalSummary } from "./-components/issue-summary.tsx"
import { SignalTriageControls } from "./-components/issue-triage-controls.tsx"
import { useSignalTriageCommands } from "./-components/use-issue-triage-commands.tsx"

const signalDetailRoute = getRouteApi("/_authenticated/projects/$projectSlug/issues/$signalId/")

function SignalDetailBreadcrumb() {
  const { projectSlug, signalId } = signalDetailRoute.useParams()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.slug, projectSlug ?? "")).findOne(),
    [projectSlug],
  )
  const { data: issue } = useSignalDetail({ projectId: project?.id ?? "", signalId, enabled: Boolean(project?.id) })

  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/issues" params={{ projectSlug }}>
        Signals
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">{issue?.name ?? "Signal"}</BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/issues/$signalId/")({
  staticData: {
    breadcrumb: SignalDetailBreadcrumb,
  },
  component: SignalDetailPage,
})

function SignalDetailPage() {
  const { projectSlug, signalId } = Route.useParams()
  const project = useRouteProject()
  const { data: issue, isLoading } = useSignalDetail({ projectId: project.id, signalId })
  // Palette: "Assign to…" / "Set priority…" live while this page is mounted.
  useSignalTriageCommands({ projectId: project.id, signalId })
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
                  <Text.H4M className="min-w-0 truncate">{issue?.name ?? "Signal not found"}</Text.H4M>
                  {issue && issue.states.length > 0 ? (
                    <div className="shrink-0">
                      <SignalLifecycleStatuses states={issue.states} />
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
              <SignalNeighborNav
                projectId={project.id}
                projectSlug={projectSlug}
                signalId={signalId}
                lifecycleGroup={lifecycleGroup}
                overlayActive={overlayActive}
              />
              <div className="mx-1 h-5 w-px bg-border" />
              <SignalTriageControls projectId={project.id} signalId={signalId} compact />
              <SignalLifecycleActions projectId={project.id} signalId={signalId} compact />
            </>
          }
        />
        <SignalDetailBody
          projectId={project.id}
          signalId={signalId}
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
              <SignalSummary projectId={project.id} signalId={signalId} />
            </>
          }
          trendAside={<SignalPatterns projectId={project.id} signalId={signalId} />}
          beforeTraces={
            <SignalExamples projectId={project.id} signalId={signalId} onOverlayActiveChange={setOverlayActive} />
          }
          append={<SignalRelated projectId={project.id} projectSlug={projectSlug} signalId={signalId} />}
        />
      </Layout.Content>
    </Layout>
  )
}
