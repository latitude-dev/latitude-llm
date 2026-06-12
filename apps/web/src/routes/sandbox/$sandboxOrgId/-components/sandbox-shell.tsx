import { Button, CopyableText, cn, Icon, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { getRouteApi, Link, Outlet, useParams, useRouter, useRouterState } from "@tanstack/react-router"
import { ArrowLeftRight, TextAlignStartIcon } from "lucide-react"
import { useState } from "react"
import { SandboxToggle } from "../../../../components/sandbox-toggle.tsx"
import { useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { useSandboxLifecycleMutations } from "../../../../domains/sandbox/sandbox.collection.ts"
import { useSandboxProjects } from "../../../../domains/sandbox/sandbox-projects.collection.ts"
import { AppSidebar, NavItem } from "../../../../layouts/AppSidebar/index.tsx"
import { toUserMessage } from "../../../../lib/errors.ts"
import { SandboxConfigModal } from "./sandbox-config-modal.tsx"
import { SandboxNavHeader } from "./sandbox-nav-header.tsx"

const sandboxRoute = getRouteApi("/sandbox/$sandboxOrgId")

function SandboxStrip({
  sandboxOrgId,
  sandboxName,
  projectSlug,
  liveProjectSlug,
  isArchived,
}: {
  readonly sandboxOrgId: string
  readonly sandboxName: string
  readonly projectSlug?: string | undefined
  readonly liveProjectSlug?: string | undefined
  readonly isArchived: boolean
}) {
  const [configOpen, setConfigOpen] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const { reactivate } = useSandboxLifecycleMutations()

  const activate = async () => {
    try {
      await reactivate.mutateAsync(sandboxOrgId)
      await router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not activate sandbox",
        description: toUserMessage(error),
      })
    }
  }

  return (
    <div className="relative flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-primary-foreground">
      {liveProjectSlug ? (
        <Link
          to="/projects/$projectSlug"
          params={{ projectSlug: liveProjectSlug }}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary-foreground hover:underline"
        >
          <Icon icon={ArrowLeftRight} size="xs" color="white" />
          Switch to live
        </Link>
      ) : (
        <Link
          to="/"
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary-foreground hover:underline"
        >
          <Icon icon={ArrowLeftRight} size="xs" color="white" />
          Switch to live
        </Link>
      )}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3">
        <Text.H6 color="white" className="text-center opacity-95">
          {isArchived
            ? "This sandbox is asleep. Activate it to resume sending traces."
            : "You're testing in a sandbox. Data you send here doesn't affect your live traces."}
        </Text.H6>
        {isArchived ? (
          <Button
            variant="default"
            size="sm"
            className="pointer-events-auto shrink-0"
            isLoading={reactivate.isPending}
            onClick={() => void activate()}
          >
            Activate
          </Button>
        ) : null}
      </div>
      {projectSlug ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={isArchived}
          onClick={() => setConfigOpen(true)}
          className="border border-primary-foreground/50 text-primary-foreground group-hover:bg-primary-foreground/10 group-hover:text-primary-foreground"
        >
          View configuration
        </Button>
      ) : (
        <span className="shrink-0" />
      )}
      <SandboxConfigModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        sandboxOrgId={sandboxOrgId}
        sandboxName={sandboxName}
        projectSlug={projectSlug}
      />
    </div>
  )
}

export function SandboxShell() {
  const router = useRouter()
  const { sandboxOrgId } = sandboxRoute.useParams()
  const sandbox = sandboxRoute.useRouteContext({ select: (c) => c.sandbox })
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { projectSlug } = useParams({ strict: false }) as {
    projectSlug?: string
  }
  const { data: projects } = useSandboxProjects(sandboxOrgId)
  const currentProject = projectSlug ? projects?.find((p) => p.slug === projectSlug) : undefined

  const linkedProjectId = currentProject?.linkedProjectId ?? undefined
  const { data: liveProject } = useProjectsCollection(
    (q) => q.where(({ project }) => eq(project.id, linkedProjectId ?? "\0")).findOne(),
    [linkedProjectId],
  )
  const liveProjectSlug = linkedProjectId ? liveProject?.slug : undefined
  const isArchived = sandbox.status === "archived"
  const [isExiting, setIsExiting] = useState(false)

  const exitToLive = async () => {
    if (isExiting) return
    setIsExiting(true)
    try {
      if (liveProjectSlug) {
        await router.navigate({ to: "/projects/$projectSlug", params: { projectSlug: liveProjectSlug } })
      } else {
        await router.navigate({ to: "/" })
      }
    } finally {
      setIsExiting(false)
    }
  }

  const tracesTo = projectSlug ? `/sandbox/${sandboxOrgId}/projects/${projectSlug}` : `/sandbox/${sandboxOrgId}`
  const tracesActive = pathname.startsWith(`/sandbox/${sandboxOrgId}/projects/`)

  return (
    <div className={cn("flex h-screen flex-col overflow-hidden", isArchived ? "bg-muted-foreground" : "bg-primary")}>
      <SandboxStrip
        sandboxOrgId={sandboxOrgId}
        sandboxName={sandbox.name}
        projectSlug={projectSlug}
        liveProjectSlug={liveProjectSlug}
        isArchived={isArchived}
      />
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-background"
        inert={isArchived}
      >
        {isArchived ? (
          <div className="absolute inset-0 z-20 cursor-not-allowed bg-background/50" aria-hidden="true" />
        ) : null}
        <SandboxNavHeader sandboxOrgId={sandboxOrgId} sandboxName={sandbox.name} />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            title={currentProject?.name ?? sandbox.name}
            subtitle={
              currentProject ? (
                <CopyableText value={currentProject.slug} size="sm" tooltip="Copy project slug" ellipsis />
              ) : (
                <Text.H6 color="foregroundMuted">Sandbox</Text.H6>
              )
            }
            footer={({ collapsed }) => (
              <SandboxToggle collapsed={collapsed} checked loading={isExiting} onToggle={() => void exitToLive()} />
            )}
          >
            {({ collapsed }) => (
              <NavItem
                icon={TextAlignStartIcon}
                label="Traces"
                to={tracesTo}
                active={tracesActive}
                collapsed={collapsed}
              />
            )}
          </AppSidebar>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
