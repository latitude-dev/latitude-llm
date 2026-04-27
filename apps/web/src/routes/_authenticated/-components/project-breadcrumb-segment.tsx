import { DropdownMenu, Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { useParams } from "@tanstack/react-router"
import { ChevronsUpDown, PlusIcon } from "lucide-react"
import { useState } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { CreateProjectModal } from "./create-project-modal.tsx"

/**
 * Project switcher / label for the header breadcrumb. Registered on `projects/$projectSlug`
 * and on `settings` (where there's no slug — renders a "Select project" placeholder).
 */
export function ProjectBreadcrumbSegment() {
  const { projectSlug } = useParams({ strict: false })
  const [createOpen, setCreateOpen] = useState(false)

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.slug, projectSlug ?? "\u0000")).findOne(),
    [projectSlug],
  )

  const { data: allProjects } = useProjectsCollection()

  // Slug in URL but no matching project: don't render a wrong label.
  if (projectSlug && !project) return null

  const [emoji, title] = project ? extractLeadingEmoji(project.name) : ["", "Select project"]

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
