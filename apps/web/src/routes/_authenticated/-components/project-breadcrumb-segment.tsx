import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxFooterAction,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  CopyButton,
  Icon,
  Text,
} from "@repo/ui"
import { extractLeadingEmoji } from "@repo/utils"
import { eq } from "@tanstack/react-db"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { useRouteProject } from "../projects/$projectSlug/-route-data.ts"
import {
  BreadcrumbSwitcherChevron,
  breadcrumbSwitcherEmojiClassName,
  breadcrumbSwitcherTriggerClassName,
} from "./breadcrumb-ui.tsx"
import { CreateProjectModal } from "./create-project-modal.tsx"

interface ProjectOption {
  readonly key: string
  readonly slug: string | null
  readonly label: string
  readonly emoji: string | null
  readonly searchText: string
  readonly isActive: boolean
}

/**
 * Project switcher / label for the header breadcrumb. Registered on `projects/$projectSlug`.
 *
 * Looks up the active project by ID (from the route loader) rather than by URL slug, so
 * renames that regenerate the slug still resolve to the live project record without needing
 * to redirect the URL.
 *
 * Uses a searchable `Combobox` so large project lists stay quick to scan. `New project`
 * is a footer action pinned below the list, so it stays visible and clickable regardless
 * of scroll position or the current search query.
 */
export function ProjectBreadcrumbSegment() {
  const navigate = useNavigate()
  const routeProject = useRouteProject()
  const [createOpen, setCreateOpen] = useState(false)
  const [comboboxOpen, setComboboxOpen] = useState(false)
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
    return (allProjects ?? [])
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
  }, [allProjects, project.id])

  const selectedOption = useMemo<ProjectOption | null>(() => items.find((item) => item.isActive) ?? null, [items])

  return (
    <>
      <div className="flex min-w-0 items-center gap-1">
        <Combobox
          autoHighlight
          modal
          open={comboboxOpen}
          onOpenChange={(open) => setComboboxOpen(open)}
          value={selectedOption}
          onValueChange={(picked: ProjectOption | null) => {
            setInputValue("")
            if (!picked || picked.isActive || !picked.slug) return
            void navigate({ to: "/projects/$projectSlug", params: { projectSlug: picked.slug } })
          }}
          items={items}
          itemToStringValue={(item: ProjectOption) => item.searchText}
          isItemEqualToValue={(a: ProjectOption, b: ProjectOption) => a.key === b.key}
        >
          <ComboboxTrigger
            ref={triggerRef}
            className={breadcrumbSwitcherTriggerClassName}
            icon={<BreadcrumbSwitcherChevron />}
          >
            {emoji && <span className={breadcrumbSwitcherEmojiClassName}>{emoji}</span>}
            <Text.H5M color="foreground" ellipsis>
              {title}
            </Text.H5M>
          </ComboboxTrigger>
          <ComboboxContent anchor={triggerRef} className="w-80 min-w-80">
            <ComboboxInput
              placeholder="Search projects..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <ComboboxList>{(item: ProjectOption) => <ProjectOptionRow key={item.key} item={item} />}</ComboboxList>
            <ComboboxEmpty>No projects found.</ComboboxEmpty>
            <ComboboxFooterAction
              label="Create new"
              icon={<Icon icon={Plus} size="sm" color="foregroundMuted" />}
              onClick={() => {
                // Explicitly close the combobox because this footer action lives inside its popup.
                setComboboxOpen(false)
                setCreateOpen(true)
              }}
            />
          </ComboboxContent>
        </Combobox>
        <CopyButton value={project.slug} tooltip="Copy project slug" className="h-6 w-6 shrink-0" />
      </div>
      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  )
}

function ProjectOptionRow({ item }: { readonly item: ProjectOption }) {
  return (
    <ComboboxItem value={item}>
      {item.emoji ? <span className="text-sm">{item.emoji}</span> : null}
      <Text.H5 className="flex-1 truncate">{item.label}</Text.H5>
    </ComboboxItem>
  )
}
