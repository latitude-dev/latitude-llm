import type { FilterSet } from "@domain/shared"
import {
  Badge,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Modal,
  Text,
  Tooltip,
  useMountEffect,
  useToast,
} from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { ChevronDownIcon, InfoIcon, Loader2, MoreVerticalIcon, PencilIcon, PlusIcon, Trash2 } from "lucide-react"
import { useState } from "react"
import { summarizeFilterSet } from "../../../../../../components/filters-builder/filter-summary.ts"
import { useHasFeatureFlag } from "../../../../../../domains/feature-flags/feature-flags.collection.ts"
import {
  useCustomBehaviorsList,
  useDeleteCustomBehavior,
} from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import type { useRouteProject } from "../../-route-data.ts"
import { BehaviourFormModal } from "./behaviour-form-modal.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

/**
 * Which form the scope header opens on mount, when a route (deep-link or a
 * Sessions/saved-search entry point) lands on create/edit rather than the
 * in-app New/⋯ Edit triggers.
 */
export type BehaviourFormIntent =
  | { readonly mode: "create"; readonly initialFilterSet?: FilterSet }
  | { readonly mode: "edit" }

const GLOBAL_LABEL = "Global behavior"

function ScopeTitle({ current }: { readonly current: CustomBehaviorRecord | null }) {
  if (current) {
    const entries = summarizeFilterSet(current.filterSet)
    return (
      <div className="flex flex-col gap-1">
        <Text.H4M>{current.name}</Text.H4M>
        {entries.length === 0 ? (
          <Text.H6 color="foregroundMuted">All sessions</Text.H6>
        ) : (
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
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-center gap-1.5">
        <Text.H4M>{GLOBAL_LABEL}</Text.H4M>
        <Tooltip asChild trigger={<Icon icon={InfoIcon} size="sm" color="foregroundMuted" />}>
          Shown by default — captures every behavior in this project. You can also create your own custom behavior to
          discover the patterns within a filtered set of sessions.
        </Tooltip>
      </div>
      <Text.H6 color="foregroundMuted">No filters applied</Text.H6>
    </div>
  )
}

function ScopeSelector({
  projectSlug,
  current,
  behaviours,
}: {
  readonly projectSlug: string
  readonly current: CustomBehaviorRecord | null
  readonly behaviours: readonly CustomBehaviorRecord[]
}) {
  const navigate = useNavigate()
  return (
    <DropdownMenuRoot modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-auto max-w-64">
          <Text.H5 ellipsis noWrap>
            {current ? current.name : GLOBAL_LABEL}
          </Text.H5>
          <Icon icon={ChevronDownIcon} size="sm" color="foregroundMuted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => void navigate({ to: "/projects/$projectSlug/behaviours", params: { projectSlug } })}
          >
            <Text.H5 ellipsis noWrap>
              {GLOBAL_LABEL}
            </Text.H5>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {behaviours.map((behaviour) => (
            <DropdownMenuItem
              key={behaviour.id}
              className="cursor-pointer"
              onSelect={() =>
                void navigate({
                  to: "/projects/$projectSlug/behaviours/$behaviourSlug",
                  params: { projectSlug, behaviourSlug: behaviour.slug },
                })
              }
            >
              <Text.H5 ellipsis noWrap className="min-w-0 flex-1">
                {behaviour.name}
              </Text.H5>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  )
}

function ScopeActionsMenu({ onEdit, onDelete }: { readonly onEdit: () => void; readonly onDelete: () => void }) {
  return (
    <DropdownMenuRoot modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Custom behavior actions">
          <Icon icon={MoreVerticalIcon} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem className="cursor-pointer items-center gap-2" onSelect={onEdit}>
            <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
            <Text.H5>Edit</Text.H5>
          </DropdownMenuItem>
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
 * The flag-gated top row of the Behaviours page: title + filter summary on the
 * left; scope selector, create button, and (for a custom behavior) an actions
 * menu on the right. Returns null when the `customBehaviors` flag is off, so the
 * page renders exactly the pre-merge global UI.
 */
export function BehavioursScopeHeader({
  project,
  current,
  initialForm,
  onFormClose,
}: {
  readonly project: RouteProject
  readonly current: CustomBehaviorRecord | null
  /** When set (route-driven), open this form on mount. */
  readonly initialForm?: BehaviourFormIntent
  /** Called when a form opened this session closes without navigating away. */
  readonly onFormClose?: () => void
}) {
  const enabled = useHasFeatureFlag("customBehaviors")
  const { toast } = useToast()
  const navigate = useNavigate()
  const { data: behaviours } = useCustomBehaviorsList(project.id, { enabled })
  const del = useDeleteCustomBehavior(project.id)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [createFilterSet, setCreateFilterSet] = useState<FilterSet | undefined>(undefined)
  const [editing, setEditing] = useState<CustomBehaviorRecord | null>(null)

  useMountEffect(() => {
    if (!enabled || !initialForm) return
    if (initialForm.mode === "create") {
      setCreateFilterSet(initialForm.initialFilterSet)
      setEditing(null)
    } else {
      if (!current) return
      setEditing(current)
    }
    setFormOpen(true)
  })

  if (!enabled) return null

  const projectSlug = project.slug

  const openCreate = () => {
    setEditing(null)
    setCreateFilterSet(undefined)
    setFormOpen(true)
  }
  const openEdit = () => {
    if (!current) return
    setEditing(current)
    setFormOpen(true)
  }
  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setCreateFilterSet(undefined)
    onFormClose?.()
  }

  const handleDelete = async () => {
    if (!current) return
    try {
      await del.mutateAsync(current.id)
      toast({ description: "Custom behavior deleted." })
      setDeleteOpen(false)
      await navigate({ to: "/projects/$projectSlug/behaviours", params: { projectSlug } })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <>
      <Layout.Header
        title={<ScopeTitle current={current} />}
        actions={
          <div className="flex flex-row items-center gap-2">
            {behaviours.length > 0 ? (
              <ScopeSelector projectSlug={projectSlug} current={current} behaviours={behaviours} />
            ) : null}
            <Button variant="outline" size="sm" className="h-8 w-auto" onClick={openCreate}>
              <Icon icon={PlusIcon} size="sm" />
              New behavior
            </Button>
            {current ? <ScopeActionsMenu onEdit={openEdit} onDelete={() => setDeleteOpen(true)} /> : null}
          </div>
        }
      />
      {formOpen ? (
        <BehaviourFormModal
          key={editing?.id ?? "new"}
          project={project}
          onClose={closeForm}
          {...(editing ? { behaviour: editing } : {})}
          {...(!editing && createFilterSet ? { initialFilterSet: createFilterSet } : {})}
        />
      ) : null}
      {deleteOpen && current ? (
        <Modal
          open
          dismissible
          onOpenChange={(next) => {
            if (!next && !del.isPending) setDeleteOpen(false)
          }}
          title="Delete custom behavior"
          description={`Delete "${current.name}"? This removes the behavior definition and its scoped taxonomy. This action cannot be undone.`}
          footer={
            <div className="flex flex-row items-center gap-2">
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={del.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete()} disabled={del.isPending}>
                {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon icon={Trash2} size="sm" />}
                {del.isPending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  )
}
