import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { useParams } from "@tanstack/react-router"
import { ChevronsUpDown, Plus } from "lucide-react"
import { useState } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { CreateProjectModal } from "./create-project-modal.tsx"

/**
 * Project switcher / label for the header breadcrumb. Registered on `projects/$projectSlug`.
 */
export function ProjectBreadcrumbSegment() {
  const { projectSlug } = useParams({ strict: false })
  const [createOpen, setCreateOpen] = useState(false)

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.slug, projectSlug ?? "\u0000")).findOne(),
    [projectSlug],
  )

  const { data: allProjects } = useProjectsCollection()
  const projectsInOrg = allProjects ?? []

  if (!project || !projectSlug) return null

  const [emoji, title] = extractLeadingEmoji(project.name)

  return (
    <>
      <CreateProjectModal open={createOpen} onOpenChange={setCreateOpen} />
      <DropdownMenuRoot>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 max-w-[min(260px,42vw)] cursor-pointer items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-muted"
          >
            {emoji ? <span className="shrink-0 text-sm">{emoji}</span> : null}
            <Text.H5M color="foregroundMuted" className="min-w-0 truncate">
              {title}
            </Text.H5M>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" className="flex w-52 flex-col gap-1">
          {projectsInOrg.map((p) => {
            const [itemEmoji, itemTitle] = extractLeadingEmoji(p.name)
            return (
              <DropdownMenuItem
                key={p.id}
                className={p.slug === projectSlug ? "bg-muted" : undefined}
                onSelect={() => {
                  window.location.href = `/projects/${p.slug}`
                }}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {itemEmoji ? <span className="shrink-0 text-sm">{itemEmoji}</span> : null}
                  <Text.H5 className="truncate">{itemTitle}</Text.H5>
                </span>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator className="my-0" />
          <DropdownMenuItem className="gap-2" onSelect={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Text.H5>New project</Text.H5>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuRoot>
    </>
  )
}
