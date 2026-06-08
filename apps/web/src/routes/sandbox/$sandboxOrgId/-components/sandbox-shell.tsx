import { Button, CopyableText, Icon, Text } from "@repo/ui"
import { getRouteApi, Link, Outlet, useParams, useRouterState } from "@tanstack/react-router"
import { ArrowLeftRight, TextAlignStartIcon } from "lucide-react"
import { useState } from "react"
import { useSandboxProjects } from "../../../../domains/sandbox/sandbox-projects.collection.ts"
import { AppSidebar, NavItem } from "../../../../layouts/AppSidebar/index.tsx"
import { SandboxConfigModal } from "./sandbox-config-modal.tsx"
import { SandboxNavHeader } from "./sandbox-nav-header.tsx"

const sandboxRoute = getRouteApi("/sandbox/$sandboxOrgId")

/**
 * Thin primary-blue strip at the very top of the sandbox. It's the *underlying
 * layer*: the white app panel below sits on top with rounded top corners, so the
 * blue peeks through as concave notches (per AGE-128 / the design reference).
 * Left: a lightweight "Switch to live" link; center: the reassurance message;
 * right: "View configuration" (once on a project) to grab the slug + API key
 * after the onboarding empty state is gone.
 */
function SandboxStrip({
  sandboxOrgId,
  sandboxName,
  projectSlug,
}: {
  readonly sandboxOrgId: string
  readonly sandboxName: string
  readonly projectSlug?: string | undefined
}) {
  const [configOpen, setConfigOpen] = useState(false)

  return (
    <div className="relative flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-primary-foreground">
      <Link
        to="/"
        className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary-foreground hover:underline"
      >
        <Icon icon={ArrowLeftRight} size="xs" color="white" />
        Switch to live
      </Link>
      <Text.H6 color="white" className="pointer-events-none absolute inset-x-0 text-center opacity-95">
        You're testing in a sandbox. Data you send here doesn't affect your live traces.
      </Text.H6>
      {projectSlug ? (
        // Outline-on-colour: ghost base (transparent container — `outline` is
        // bg-secondary and the white fill can't be overridden via className),
        // with a white border + white text for the blue strip.
        <Button
          variant="ghost"
          size="sm"
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

/**
 * Wrapper layout for the `/sandbox/:sandboxOrgId/*` namespace. The blue strip is
 * an underlying layer; the white app panel (header + sidebar + routed page) sits
 * on top with rounded top corners. The header mirrors production (project
 * switcher + account); the sidebar carries only **Traces** for now. Owns its own
 * viewport height because this namespace lives outside `_authenticated`.
 */
export function SandboxShell() {
  const { sandboxOrgId } = sandboxRoute.useParams()
  const sandbox = sandboxRoute.useRouteContext({ select: (c) => c.sandbox })
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { projectSlug } = useParams({ strict: false }) as { projectSlug?: string }
  const { data: projects } = useSandboxProjects(sandboxOrgId)
  const currentProject = projectSlug ? projects?.find((p) => p.slug === projectSlug) : undefined

  const tracesTo = projectSlug ? `/sandbox/${sandboxOrgId}/projects/${projectSlug}` : `/sandbox/${sandboxOrgId}`
  const tracesActive = pathname.startsWith(`/sandbox/${sandboxOrgId}/projects/`)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-primary">
      <SandboxStrip sandboxOrgId={sandboxOrgId} sandboxName={sandbox.name} projectSlug={projectSlug} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-background">
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
