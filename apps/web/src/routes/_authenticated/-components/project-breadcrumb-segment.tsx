import { DropdownMenu, DropdownMenuTrigger, Text } from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { useParams } from "@tanstack/react-router"
import { ChevronsUpDown } from "lucide-react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { BreadcrumbText } from "./breadcrumb-ui.tsx"

/**
 * Project switcher / label for the header breadcrumb. Registered on `projects/$projectSlug`.
 */
export function ProjectBreadcrumbSegment() {
  const { projectSlug } = useParams({ strict: false })

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.slug, projectSlug ?? "\u0000")).findOne(),
    [projectSlug],
  )

  const { data: allProjects } = useProjectsCollection()
  const hasMultipleProjects = (allProjects?.length ?? 0) > 1

  if (!project || !projectSlug) return null

  const [emoji, title] = extractLeadingEmoji(project.name)

  return hasMultipleProjects ? (
    <DropdownMenu
      side="bottom"
      align="start"
      options={
        allProjects?.map((p) => ({
          label: p.name,
          onClick: () => {
            window.location.href = `/projects/${p.slug}`
          },
        })) ?? []
      }
      trigger={() => (
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
          >
            {emoji && <span className="text-sm">{emoji}</span>}
            <Text.H5M color="foregroundMuted">{title}</Text.H5M>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
      )}
    />
  ) : (
    <BreadcrumbText variant="muted">
      {emoji && `${emoji} `}
      {title}
    </BreadcrumbText>
  )
}
