import { DropdownMenu, Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { ChevronsUpDown, PlusIcon } from "lucide-react"
import { useState } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { useRouteProject } from "../projects/$projectSlug/-route-data.ts"
import { CreateProjectModal } from "./create-project-modal.tsx"

/**
 * Project switcher / label for the header breadcrumb. Registered on `projects/$projectSlug`.
 *
 * Looks up the active project by ID (from the route loader) rather than by URL slug, so
 * renames that regenerate the slug still resolve to the live project record without needing
 * to redirect the URL.
 */
export function ProjectBreadcrumbSegment() {
  const routeProject = useRouteProject()
  const [createOpen, setCreateOpen] = useState(false)

  const { data: liveProject } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, routeProject.id)).findOne(),
    [routeProject.id],
  )
  const project = liveProject ?? routeProject

  const { data: allProjects } = useProjectsCollection()

  const [emoji, title] = extractLeadingEmoji(project.name)

  return (
    <>
      <DropdownMenu
        side="bottom"
        align="start"
        options={[
          ...(allProjects?.map((p) => ({
            label: p.name,
            onClick: () => {
              window.location.href = `/projects/${p.slug}`
            },
          })) ?? []),
          {
            label: "New project",
            iconProps: { icon: PlusIcon, size: "sm" },
            onClick: () => setCreateOpen(true),
          },
        ]}
        trigger={() => (
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
          >
            {emoji && <span className="text-sm">{emoji}</span>}
            <Text.H5M color="foregroundMuted">{title}</Text.H5M>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      />
      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}
