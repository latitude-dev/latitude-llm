import { Avatar, DropdownMenu, LatitudeLogo } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { useParams, useRouter } from "@tanstack/react-router"
import { ChevronsUpDown, Moon, Plus, Sun } from "lucide-react"
import { useState } from "react"
import { useSandboxProjects } from "../../../../domains/sandbox/sandbox-projects.collection.ts"
import { getSession } from "../../../../domains/sessions/session.functions.ts"
import { authClient } from "../../../../lib/auth-client.ts"
import { useThemePreference } from "../../../../lib/theme.ts"
import { SandboxAddProjectModal } from "./sandbox-add-project-modal.tsx"

/**
 * The sandbox's top app header — visually the production `NavHeader`, but scoped
 * to the sandbox: `Latitude / {sandbox} / {project}` on the left with a project
 * switcher (its "New project" opens the sandbox add-project modal, not the Live
 * create-project flow), and the user account menu on the right. Switching back
 * to Live lives in the blue strip above, so it's intentionally not repeated here.
 */
export function SandboxNavHeader({
  sandboxOrgId,
  sandboxName,
}: {
  readonly sandboxOrgId: string
  readonly sandboxName: string
}) {
  const router = useRouter()
  const { projectSlug } = useParams({ strict: false }) as { projectSlug?: string }
  const { data: projects } = useSandboxProjects(sandboxOrgId)
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: () => getSession() })
  const { theme, setTheme } = useThemePreference()
  const [addOpen, setAddOpen] = useState(false)

  const user = session?.user
  const currentProject = projects?.find((p) => p.slug === projectSlug)
  const nextTheme = theme === "dark" ? "light" : "dark"

  const projectOptions = [
    ...(projects ?? []).map((p) => ({
      label: p.name,
      selected: p.slug === projectSlug,
      onClick: () =>
        void router.navigate({
          to: "/sandbox/$sandboxOrgId/projects/$projectSlug",
          params: { sandboxOrgId, projectSlug: p.slug },
        }),
    })),
    { type: "separator" as const },
    { label: "New project", iconProps: { icon: Plus, size: "sm" as const }, onClick: () => setAddOpen(true) },
  ]

  return (
    <header className="flex h-12 w-full shrink-0 items-center border-b border-border bg-background px-4">
      <div className="flex flex-1 items-center gap-2">
        <LatitudeLogo className="h-5 w-5" />
        <span className="select-none text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium text-foreground">{sandboxName}</span>
        <span className="select-none text-sm text-muted-foreground">/</span>
        <DropdownMenu
          side="bottom"
          align="start"
          options={projectOptions}
          trigger={() => (
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-muted"
            >
              <span className="text-sm font-medium text-foreground">{currentProject?.name ?? "Select project"}</span>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        />
      </div>
      <div className="flex items-center gap-4">
        <a
          href="https://docs.latitude.so"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-foreground transition-colors hover:text-muted-foreground"
        >
          Docs
        </a>
        {user ? (
          <DropdownMenu
            side="bottom"
            align="end"
            options={[
              {
                label: "Switch theme",
                iconProps: { icon: theme === "dark" ? Sun : Moon, size: "sm" as const },
                onClick: () => setTheme(nextTheme),
              },
              {
                label: "Log out",
                type: "destructive",
                onClick: () => {
                  void authClient.signOut().then(() => router.navigate({ to: "/login" }))
                },
              },
            ]}
            trigger={() => (
              <button type="button" className="flex cursor-pointer items-center">
                <Avatar name={user.name?.trim() ? user.name : user.email} size="sm" imageSrc={user.image ?? null} />
              </button>
            )}
          />
        ) : null}
      </div>
      <SandboxAddProjectModal sandboxOrgId={sandboxOrgId} open={addOpen} onOpenChange={setAddOpen} />
    </header>
  )
}
