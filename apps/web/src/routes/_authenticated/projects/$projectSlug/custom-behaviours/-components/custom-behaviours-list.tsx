import type { FilterSet } from "@domain/shared"
import { type CustomBehaviorStatus, MAX_CUSTOM_BEHAVIORS_PER_PROJECT } from "@domain/taxonomy"
import {
  Badge,
  type BadgeProps,
  Button,
  Icon,
  Modal,
  Table,
  TableBlankSlate,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Text,
  Tooltip,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { Loader2, PencilIcon, PlusIcon, RefreshCwIcon, SlidersHorizontalIcon, SparklesIcon, Trash2 } from "lucide-react"
import { useState } from "react"
import { summarizeFilterSet } from "../../../../../../components/filters-builder/filter-summary.ts"
import {
  useCustomBehaviorPreview,
  useCustomBehaviorsList,
  useDeleteCustomBehavior,
  useGenerateCustomBehavior,
} from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { CustomBehaviourModal } from "./custom-behaviour-modal.tsx"

const STATUS_META: Record<CustomBehaviorStatus, { readonly label: string; readonly variant: BadgeProps["variant"] }> = {
  pending: { label: "Pending", variant: "muted" },
  generating: { label: "Generating", variant: "warningMuted" },
  ready: { label: "Ready", variant: "successMuted" },
  failed: { label: "Failed", variant: "destructiveMuted" },
}

function PreviewCell({ projectId, filterSet }: { readonly projectId: string; readonly filterSet: FilterSet }) {
  const { data, isLoading, isError } = useCustomBehaviorPreview(projectId, filterSet)
  if (isError) return <Text.H6 color="foregroundMuted">—</Text.H6>
  if (isLoading || !data) return <Text.H6 color="foregroundMuted">Calculating…</Text.H6>
  const summary = `${data.observationCount.toLocaleString()} obs · ${data.sessionCount.toLocaleString()} sessions`
  if (!data.isReady) {
    return (
      <Tooltip asChild trigger={<Text.H6 color="warningMutedForeground">{summary}</Text.H6>}>
        {`Needs at least ${data.minObservations} observations before a taxonomy can be generated.`}
      </Tooltip>
    )
  }
  return <Text.H6 color="foregroundMuted">{summary}</Text.H6>
}

function FilterSummaryCell({ filterSet }: { readonly filterSet: FilterSet }) {
  const labels = summarizeFilterSet(filterSet)
  if (labels.length === 0) return <Text.H6 color="foregroundMuted">All sessions</Text.H6>
  const shown = labels.slice(0, 3)
  const rest = labels.length - shown.length
  return (
    <div className="flex flex-row flex-wrap items-center gap-1">
      {shown.map((label) => (
        <Badge key={label} variant="muted" size="small">
          {label}
        </Badge>
      ))}
      {rest > 0 ? <Badge variant="muted" size="small">{`+${rest}`}</Badge> : null}
    </div>
  )
}

function CustomBehaviourRow({
  projectId,
  projectSlug,
  behaviour,
  onEdit,
  onDelete,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly behaviour: CustomBehaviorRecord
  readonly onEdit: (behaviour: CustomBehaviorRecord) => void
  readonly onDelete: (behaviour: CustomBehaviorRecord) => void
}) {
  const status = STATUS_META[behaviour.status]
  const generate = useGenerateCustomBehavior(projectId)
  const { toast } = useToast()
  const isGenerating = behaviour.status === "generating"
  const neverGenerated = behaviour.status === "pending"

  const runGenerate = async () => {
    try {
      await generate.mutateAsync(behaviour.id)
      toast({ description: "Generation started. The tree updates when it completes." })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <TableRow verticalPadding hoverable={false}>
      <TableCell>
        <Link
          to="/projects/$projectSlug/custom-behaviours/$behaviourSlug"
          params={{ projectSlug, behaviourSlug: behaviour.slug }}
          aria-label={`Open the ${behaviour.name} behavior tree`}
          className="hover:underline"
        >
          <Text.H5>{behaviour.name}</Text.H5>
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
      </TableCell>
      <TableCell>
        <FilterSummaryCell filterSet={behaviour.filterSet} />
      </TableCell>
      <TableCell>
        <PreviewCell projectId={projectId} filterSet={behaviour.filterSet} />
      </TableCell>
      <TableCell>
        <Text.H6 color="foregroundMuted">
          {behaviour.status === "pending" ? "Never" : relativeTime(behaviour.updatedAt)}
        </Text.H6>
      </TableCell>
      <TableCell align="right">
        <div className="inline-flex flex-row items-center gap-1">
          <Tooltip
            asChild
            trigger={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void runGenerate()}
                disabled={isGenerating || generate.isPending}
                aria-label={neverGenerated ? "Generate custom behavior" : "Regenerate custom behavior"}
              >
                <Icon
                  icon={isGenerating || generate.isPending ? Loader2 : neverGenerated ? SparklesIcon : RefreshCwIcon}
                  size="sm"
                  className={isGenerating || generate.isPending ? "animate-spin" : ""}
                />
              </Button>
            }
          >
            {isGenerating ? "Generating…" : neverGenerated ? "Generate" : "Regenerate"}
          </Tooltip>
          <Tooltip
            asChild
            trigger={
              <Button variant="ghost" size="icon" onClick={() => onEdit(behaviour)} aria-label="Edit custom behavior">
                <Icon icon={PencilIcon} size="sm" />
              </Button>
            }
          >
            Edit
          </Tooltip>
          <Tooltip
            asChild
            trigger={
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(behaviour)}
                aria-label="Delete custom behavior"
              >
                <Icon icon={Trash2} size="sm" />
              </Button>
            }
          >
            Delete
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function CustomBehavioursList({
  projectId,
  projectSlug,
  initialCreateFilterSet,
}: {
  readonly projectId: string
  readonly projectSlug: string
  /** When present, the create modal opens on mount with these filters prefilled
   * (topics already stripped) — set by the "Create custom behavior" entry points. */
  readonly initialCreateFilterSet?: FilterSet
}) {
  const { toast } = useToast()
  const { data: behaviours, isLoading } = useCustomBehaviorsList(projectId)
  const del = useDeleteCustomBehavior(projectId)
  const [modalOpen, setModalOpen] = useState(Boolean(initialCreateFilterSet))
  const [editTarget, setEditTarget] = useState<CustomBehaviorRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CustomBehaviorRecord | null>(null)
  const [prefillFilterSet, setPrefillFilterSet] = useState<FilterSet | undefined>(initialCreateFilterSet)

  const sorted = [...behaviours].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  const atCap = behaviours.length >= MAX_CUSTOM_BEHAVIORS_PER_PROJECT

  const openCreate = () => {
    setEditTarget(null)
    setPrefillFilterSet(undefined)
    setModalOpen(true)
  }
  const openEdit = (behaviour: CustomBehaviorRecord) => {
    setEditTarget(behaviour)
    setPrefillFilterSet(undefined)
    setModalOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await del.mutateAsync(deleteTarget.id)
      toast({ description: "Custom behavior deleted." })
      setDeleteTarget(null)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  const newButton = (
    <Button variant="default" onClick={openCreate} disabled={atCap}>
      <Icon size="sm" icon={PlusIcon} />
      New custom behavior
    </Button>
  )

  return (
    <Layout>
      <Layout.Content>
        <Layout.Header
          title="Custom behaviors"
          description="Named, filter-scoped session groups clustered into their own behavior sub-tree."
          actions={
            <div className="flex flex-row items-center gap-3">
              <Text.H6 color="foregroundMuted">
                {behaviours.length} / {MAX_CUSTOM_BEHAVIORS_PER_PROJECT}
              </Text.H6>
              {atCap ? (
                <Tooltip asChild trigger={<span className="inline-flex">{newButton}</span>}>
                  {`You've reached the maximum of ${MAX_CUSTOM_BEHAVIORS_PER_PROJECT} custom behaviors for this project.`}
                </Tooltip>
              ) : (
                newButton
              )}
            </div>
          }
        />
        <Layout.List>
          {isLoading ? (
            <TableSkeleton cols={6} rows={3} />
          ) : sorted.length === 0 ? (
            <TableBlankSlate
              description={
                <div className="flex flex-col items-center justify-center gap-4">
                  <Icon icon={SlidersHorizontalIcon} size="xl" color="foregroundMuted" />
                  No custom behaviors yet. Create one to cluster a filtered slice of sessions into its own behavior
                  tree.
                  <Button onClick={openCreate}>
                    <Icon size="sm" icon={PlusIcon} />
                    New custom behavior
                  </Button>
                </div>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filters</TableHead>
                  <TableHead>Preview (last 7 days)</TableHead>
                  <TableHead>Last generated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((behaviour) => (
                  <CustomBehaviourRow
                    key={behaviour.id}
                    projectId={projectId}
                    projectSlug={projectSlug}
                    behaviour={behaviour}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </Layout.List>

        {modalOpen ? (
          <CustomBehaviourModal
            key={editTarget?.id ?? "new"}
            projectId={projectId}
            behaviour={editTarget}
            {...(prefillFilterSet ? { initialFilterSet: prefillFilterSet } : {})}
            onClose={() => {
              setModalOpen(false)
              setPrefillFilterSet(undefined)
            }}
          />
        ) : null}

        {deleteTarget ? (
          <Modal
            open
            dismissible
            onOpenChange={(open) => {
              if (!open && !del.isPending) setDeleteTarget(null)
            }}
            title="Delete custom behavior"
            description={`Delete "${deleteTarget.name}"? This removes the behavior definition and its scoped taxonomy. This action cannot be undone.`}
            footer={
              <div className="flex flex-row items-center gap-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={del.isPending}>
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
      </Layout.Content>
    </Layout>
  )
}
