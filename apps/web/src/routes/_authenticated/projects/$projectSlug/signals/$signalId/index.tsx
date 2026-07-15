import { Button, CopyableText, Icon, Skeleton, TagList, Text, Tooltip } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { ArrowLeftIcon, PencilIcon } from "lucide-react"
import { useState } from "react"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useSignalDetail } from "../../../../../../domains/signals/signals.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { SignalDetailBody } from "../-components/signal-detail-drawer.tsx"
import { SignalLifecycleActions } from "../-components/signal-lifecycle-actions.tsx"
import { SignalLifecycleStatuses } from "../-components/signal-lifecycle-statuses.tsx"
import { SignalRenameModal } from "../-components/signal-rename-modal.tsx"
import { SignalExamples } from "./-components/signal-examples.tsx"
import { SignalNeighborNav } from "./-components/signal-neighbor-nav.tsx"
import { SignalPatterns } from "./-components/signal-patterns.tsx"
import { SignalRelated } from "./-components/signal-related.tsx"
import { SignalSendTo } from "./-components/signal-send-to.tsx"
import { SignalSummary } from "./-components/signal-summary.tsx"
import { SignalTriageControls } from "./-components/signal-triage-controls.tsx"
import { useSignalTriageCommands } from "./-components/use-signal-triage-commands.tsx"

const signalDetailRoute = getRouteApi("/_authenticated/projects/$projectSlug/signals/$signalId/")

function SignalDetailBreadcrumb() {
  const { projectSlug, signalId } = signalDetailRoute.useParams()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.slug, projectSlug ?? "")).findOne(),
    [projectSlug],
  )
  const { data: signal } = useSignalDetail({ projectId: project?.id ?? "", signalId, enabled: Boolean(project?.id) })

  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/signals" params={{ projectSlug }}>
        Signals
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">{signal?.name ?? "Signal"}</BreadcrumbText>
    </>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/signals/$signalId/")({
  staticData: {
    breadcrumb: SignalDetailBreadcrumb,
  },
  component: SignalDetailPage,
})

function SignalDetailPage() {
  const { projectSlug, signalId } = Route.useParams()
  const project = useRouteProject()
  const { data: signal, isLoading } = useSignalDetail({ projectId: project.id, signalId })
  // Palette: "Assign to…" / "Set priority…" live while this page is mounted.
  useSignalTriageCommands({ projectId: project.id, signalId })
  // A trace sheet (from Examples or the Traces table) being open suppresses the
  // J/K prev/next-signal hotkeys so paging a trace never swaps the signal under it.
  const [overlayActive, setOverlayActive] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const lifecycleGroup = signal?.mutedAt ? "archived" : "active"

  return (
    <Layout>
      <Layout.Content>
        <Layout.Header
          title={
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-1">
                <Tooltip
                  asChild
                  side="bottom"
                  trigger={
                    <Button asChild variant="ghost" className="h-7 w-7 p-0" aria-label="Back to signals">
                      <Link to="/projects/$projectSlug/signals" params={{ projectSlug }}>
                        <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </Button>
                  }
                >
                  Back to signals
                </Tooltip>
                <div className="h-4 w-px bg-border" />
                <SignalNeighborNav
                  projectId={project.id}
                  projectSlug={projectSlug}
                  signalId={signalId}
                  lifecycleGroup={lifecycleGroup}
                  overlayActive={overlayActive}
                />
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-56" />
              ) : (
                <div className="group/title flex min-w-0 items-center gap-2">
                  <Text.H4M className="min-w-0 truncate">{signal?.name ?? "Signal not found"}</Text.H4M>
                  {signal && signal.states.length > 0 ? (
                    <div className="shrink-0">
                      <SignalLifecycleStatuses states={signal.states} />
                    </div>
                  ) : null}
                  {signal?.origin === "user" ? (
                    <Tooltip
                      asChild
                      side="bottom"
                      trigger={
                        <Button
                          variant="ghost"
                          className="h-7 w-7 shrink-0 p-0 opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-within/title:opacity-100 focus-visible:opacity-100"
                          aria-label="Edit signal name and description"
                          onClick={() => setRenameOpen(true)}
                        >
                          <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
                        </Button>
                      }
                    >
                      Edit name & description
                    </Tooltip>
                  ) : null}
                </div>
              )}
            </div>
          }
          description={
            !isLoading && signal ? (
              <div className="flex max-w-max">
                <CopyableText value={signal.slug} size="sm" ellipsis tooltip="Copy signal slug" />
              </div>
            ) : undefined
          }
          actions={
            <>
              <SignalSendTo
                projectId={project.id}
                projectSlug={projectSlug}
                signalId={signalId}
                disabled={isLoading || !signal}
              />
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
                  <Text.H5 color="foregroundMuted">{signal?.description ?? "This signal could not be loaded."}</Text.H5>
                )}
                {!isLoading && signal && signal.tags.length > 0 ? <TagList tags={signal.tags} wrap /> : null}
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
        {renameOpen && signal ? (
          <SignalRenameModal
            projectId={project.id}
            signalId={signalId}
            name={signal.name}
            description={signal.description}
            onClose={() => setRenameOpen(false)}
          />
        ) : null}
      </Layout.Content>
    </Layout>
  )
}
