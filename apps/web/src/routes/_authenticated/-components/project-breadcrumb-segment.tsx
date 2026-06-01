import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  Icon,
  Text,
} from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { PlusIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { useRouteProject } from "../projects/$projectSlug/-route-data.ts"
import { CreateProjectModal } from "./create-project-modal.tsx"

const NEW_PROJECT_KEY = "@new-project"

interface ProjectOption {
  readonly key: string
  readonly slug: string | null
  readonly label: string
  readonly emoji: string | null
  readonly searchText: string
  readonly isActive: boolean
}

const NEW_PROJECT_OPTION: ProjectOption = {
  key: NEW_PROJECT_KEY,
  slug: null,
  label: "New project",
  emoji: null,
  searchText: "new project create",
  isActive: false,
}

/**
 * Project switcher / label for the header breadcrumb. Registered on `projects/$projectSlug`.
 *
 * Looks up the active project by ID (from the route loader) rather than by URL slug, so
 * renames that regenerate the slug still resolve to the live project record without needing
 * to redirect the URL.
 *
 * Uses a searchable `Combobox` so large project lists stay quick to scan; a trailing
 * `New project` item opens the create modal instead of navigating.
 */
export function ProjectBreadcrumbSegment() {
  const routeProject = useRouteProject()
  const [createOpen, setCreateOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)

  const { data: liveProject } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, routeProject.id)).findOne(),
    [routeProject.id],
  )
  const project = liveProject ?? routeProject

  const { data: allProjects } = useProjectsCollection()

  const [emoji, title] = extractLeadingEmoji(project.name)

  const items = useMemo<ProjectOption[]>(() => {
    const projectOptions = (allProjects ?? [])
      .map((p): ProjectOption => {
        const [projectEmoji, projectTitle] = extractLeadingEmoji(p.name)
        const label = projectTitle || p.name
        return {
          key: p.id,
          slug: p.slug,
          label,
          emoji: projectEmoji || null,
          searchText: label.toLowerCase(),
          isActive: p.id === project.id,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
    return [...projectOptions, NEW_PROJECT_OPTION]
  }, [allProjects, project.id])

  const selectedOption = useMemo<ProjectOption | null>(() => items.find((item) => item.isActive) ?? null, [items])

  return (
    <>
      <Combobox
        autoHighlight
        modal
        value={selectedOption}
        onValueChange={(picked: ProjectOption | null) => {
          setInputValue("")
          if (!picked) return
          if (picked.key === NEW_PROJECT_KEY) {
            setCreateOpen(true)
            return
          }
          if (picked.isActive || !picked.slug) return
          window.location.href = `/projects/${picked.slug}`
        }}
        items={items}
        itemToStringValue={(item: ProjectOption) => item.searchText}
        isItemEqualToValue={(a: ProjectOption, b: ProjectOption) => a.key === b.key}
      >
        <ComboboxTrigger
          ref={triggerRef}
          className="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted [&>svg]:text-muted-foreground"
        >
          {emoji && <span className="text-sm">{emoji}</span>}
          <Text.H5M color="foregroundMuted">{title}</Text.H5M>
        </ComboboxTrigger>
        <ComboboxContent anchor={triggerRef} className="w-80 min-w-80">
          <ComboboxInput
            placeholder="Search projects..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <ComboboxList>{(item: ProjectOption) => <ProjectOptionRow item={item} />}</ComboboxList>
          <ComboboxEmpty>No projects found.</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}

function ProjectOptionRow({ item }: { readonly item: ProjectOption }) {
  if (item.key === NEW_PROJECT_KEY) {
    return (
      <ComboboxItem value={item}>
        <Icon icon={PlusIcon} size="sm" color="foregroundMuted" />
        <Text.H5 className="flex-1 truncate">{item.label}</Text.H5>
      </ComboboxItem>
    )
  }
  return (
    <ComboboxItem value={item}>
      {item.emoji ? (
        <span className="text-sm">{item.emoji}</span>
      ) : (
        <span className="size-4 shrink-0" aria-hidden="true" />
      )}
      <Text.H5 className="flex-1 truncate">{item.label}</Text.H5>
    </ComboboxItem>
  )
}
