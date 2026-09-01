import type { FilterSet } from "@domain/shared"
import {
  Badge,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  Icon,
  Modal,
  Text,
  Tooltip,
  useMountEffect,
  useToast,
} from "@repo/ui"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, Loader2, MoreVerticalIcon, PencilIcon, PlusIcon, Trash2 } from "lucide-react"
import { useState } from "react"
import { summarizeFilterSet } from "../../../../../../components/filters-builder/filter-summary.ts"
import { useDeleteCustomBehavior } from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { SectionHeader } from "../../-components/section-header.tsx"
import type { useRouteProject } from "../../-route-data.ts"
import { BehaviourFormModal } from "./behaviour-form-modal.tsx"
import type { BehaviourScope } from "./behaviour-scope.ts"
import { BehaviourViewChips } from "./behaviour-view-chips.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

/**
 * Which form the header opens on mount, when a route (deep-link or a
 * Sessions/saved-search entry point) lands on create/edit rather than the in-app
 * triggers.
 */
export type BehaviourFormIntent =
  | { readonly mode: "create"; readonly initialFilterSet?: FilterSet }
  | { readonly mode: "edit" }

function FilterSummary({ filterSet }: { readonly filterSet: FilterSet }) {
  const entries = summarizeFilterSet(filterSet)
  if (entries.length === 0) return null
  return (
    <div className="flex min-w-0 flex-row flex-wrap items-center gap-1">
      {entries.map((entry) => (
        <Tooltip
          key={entry.key}
          asChild
          side="bottom"
          trigger={
            <Badge variant="muted" size="small" className="max-w-64 cursor-default">
              <span className="truncate">
                {entry.label}
                {entry.preview ? <span className="text-muted-foreground">: {entry.preview}</span> : null}
              </span>
            </Badge>
          }
        >
          <span className="block max-w-xs break-words">
            {entry.label}
            {entry.preview ? `: ${entry.preview}` : ""}
          </span>
        </Tooltip>
      ))}
    </div>
  )
}

function ActionsMenu({ onEdit, onDelete }: { readonly onEdit?: () => void; readonly onDelete: () => void }) {
  return (
    <DropdownMenuRoot modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Behavior actions">
          <Icon icon={MoreVerticalIcon} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="end" className="w-40">
          {onEdit ? (
            <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={onEdit}>
              <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
              <Text.H5>Edit</Text.H5>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={onDelete}>
            <Icon icon={Trash2} size="sm" color="destructive" />
            <Text.H5 color="destructive">Delete</Text.H5>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  )
}

/**
 * The top of a behavior's page: what this behavior groups sessions by, its views,
 * and the actions on whichever of them is open. `+ View` narrows the behavior into
 * a new slice, so it only appears on the behavior itself — a view is already a
 * slice, and slicing a slice is not a thing.
 */
export function BehavioursScopeHeader({
  project,
  scope,
  initialForm,
  onFormClose,
}: {
  readonly project: RouteProject
  readonly scope: BehaviourScope
  readonly initialForm?: BehaviourFormIntent
  readonly onFormClose?: () => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const del = useDeleteCustomBehavior(project.id)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [createFilterSet, setCreateFilterSet] = useState<FilterSet | undefined>(undefined)

  const { main, view, views } = scope
  const projectSlug = project.slug
  // Deleting the target the page is about: the open view, or the behavior itself.
  const deleteTarget = view ?? main.record
  // A view can only be gardened once its behavior has finished its first
  // extraction. Until then there are no cached answers to slice.
  const behaviorCooking = main.record?.status === "generating" || deleteTarget?.status === "generating"

  useMountEffect(() => {
    if (!initialForm) return
    if (initialForm.mode === "create") {
      setCreateFilterSet(initialForm.initialFilterSet)
      setEditing(false)
      setFormOpen(true)
      return
    }
    if (!view) return
    setEditing(true)
    setFormOpen(true)
  })

  const openCreateForm = () => {
    setEditing(false)
    setCreateFilterSet(undefined)
    setFormOpen(true)
  }
  const openEditForm = () => {
    setEditing(true)
    setFormOpen(true)
  }
  const closeForm = () => {
    setFormOpen(false)
    setEditing(false)
    setCreateFilterSet(undefined)
    onFormClose?.()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await del.mutateAsync(deleteTarget.id)
      toast({ description: view ? "View deleted." : "Behavior deleted." })
      setDeleteOpen(false)
      await (view
        ? navigate({
            to: "/projects/$projectSlug/behaviours/$behaviourSlug",
            params: { projectSlug, behaviourSlug: main.slug },
          })
        : navigate({ to: "/projects/$projectSlug/behaviours", params: { projectSlug } }))
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <>
      <Layout.Header
        title={
          <div className="flex min-w-0 flex-col gap-3">
            <Tooltip
              asChild
              side="bottom"
              trigger={
                <Button asChild variant="ghost" size="sm" className="w-fit" aria-label="Back to behaviors">
                  <Link to="/projects/$projectSlug/behaviours" params={{ projectSlug }}>
                    <Icon icon={ArrowLeftIcon} size="sm" />
                    Back
                  </Link>
                </Button>
              }
            >
              Back to behaviors
            </Tooltip>
            <SectionHeader title={view ? view.name : main.name} description={main.description ?? undefined} />
          </div>
        }
        actions={
          <div className="flex flex-row items-center gap-2">
            {view ? null : behaviorCooking ? (
              <Tooltip
                asChild
                trigger={
                  <span>
                    <Button variant="outline" size="sm" className="h-8 w-auto" disabled>
                      <Icon icon={PlusIcon} size="sm" />
                      View
                    </Button>
                  </span>
                }
              >
                This behavior is still analyzing your sessions. You can add a view once it's ready.
              </Tooltip>
            ) : (
              <Button variant="outline" size="sm" className="h-8 w-auto" onClick={openCreateForm}>
                <Icon icon={PlusIcon} size="sm" />
                View
              </Button>
            )}
            {deleteTarget && !behaviorCooking ? (
              <ActionsMenu {...(view ? { onEdit: openEditForm } : {})} onDelete={() => setDeleteOpen(true)} />
            ) : null}
          </div>
        }
      />
      {views.length > 0 || view ? (
        <div className="flex flex-col gap-2 px-6">
          <BehaviourViewChips
            projectSlug={projectSlug}
            behaviourSlug={main.slug}
            views={views}
            activeViewSlug={view?.slug ?? null}
          />
          {view ? <FilterSummary filterSet={view.filterSet} /> : null}
        </div>
      ) : null}
      {formOpen ? (
        <BehaviourFormModal
          key={editing && view ? view.id : "new"}
          project={project}
          parent={main}
          onClose={closeForm}
          {...(editing && view ? { behaviour: view } : {})}
          {...(!editing && createFilterSet ? { initialFilterSet: createFilterSet } : {})}
        />
      ) : null}
      {deleteOpen && deleteTarget ? (
        <Modal
          open
          dismissible
          onOpenChange={(next) => {
            if (!next && !del.isPending) setDeleteOpen(false)
          }}
          title={view ? "Delete view" : "Delete behavior"}
          description={
            view
              ? `Delete "${deleteTarget.name}"? This removes the view and its scoped taxonomy. This action cannot be undone.`
              : `Delete "${deleteTarget.name}"? This removes the behavior, its views, and everything it grouped. This action cannot be undone.`
          }
          footer={
            <div className="flex flex-row items-center gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={del.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete()} disabled={del.isPending}>
                {del.isPending ? (
                  <Icon icon={Loader2} size="sm" className="animate-spin" />
                ) : (
                  <Icon icon={Trash2} size="sm" />
                )}
                {del.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  )
}
