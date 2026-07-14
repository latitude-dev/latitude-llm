import { MAX_VARIANTS_PER_EXPERIMENT, METRIC_ENTITIES } from "@domain/experiments"
import {
  Button,
  ButtonGroup,
  cn,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  Skeleton,
  Text,
  Tooltip,
} from "@repo/ui"
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  BookmarkPlusIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import {
  type ExperimentComparisonRecord,
  useExperiment,
  useExperimentComparison,
  useExperimentVariantActions,
} from "../../../../../../domains/experiments/experiments.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { BreadcrumbLink, BreadcrumbSeparator, BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import { ComparisonTable } from "./comparison-table.tsx"
import { ExperimentDeleteConfirmModal, ExperimentRenameModal } from "./experiment-modals.tsx"
import { ExperimentVariantsEmptyState } from "./variant-empty-state.tsx"
import { VariantImportFromSearchModal } from "./variant-modals.tsx"

const detailRoute = getRouteApi("/_authenticated/projects/$projectSlug/experiments/$experimentSlug/")

export function ExperimentBreadcrumb() {
  const { projectSlug, experimentSlug } = detailRoute.useParams()
  return (
    <>
      <BreadcrumbLink to="/projects/$projectSlug/experiments" params={{ projectSlug }}>
        Experiments
      </BreadcrumbLink>
      <BreadcrumbSeparator />
      <BreadcrumbText variant="current">{experimentSlug}</BreadcrumbText>
    </>
  )
}

export function ExperimentDetailPage() {
  const project = useRouteProject()
  const { experimentSlug } = detailRoute.useParams()
  const navigate = useNavigate()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // Which metric sections are expanded, shared across every variant card so a section opens/closes
  // in lockstep across all variants. Every entity starts expanded.
  const [openMetricEntities, setOpenMetricEntities] = useState<ReadonlySet<string>>(() => new Set(METRIC_ENTITIES))
  const toggleMetricEntity = useCallback((entity: string) => {
    setOpenMetricEntities((prev) => {
      const next = new Set(prev)
      if (next.has(entity)) next.delete(entity)
      else next.add(entity)
      return next
    })
  }, [])

  const comparisonQuery = useExperimentComparison({ projectId: project.id, slug: experimentSlug })
  // Cheap header source that resolves before the (heavier) comparison read.
  const experimentQuery = useExperiment({ projectId: project.id, slug: experimentSlug })

  const comparison: ExperimentComparisonRecord | null = comparisonQuery.data ?? null
  const experiment = comparison?.experiment ?? experimentQuery.data ?? null

  const actions = useExperimentVariantActions(
    project.id,
    experiment ?? { id: "", slug: "", name: "", description: "", variants: [], createdAt: "", updatedAt: "" },
  )

  const orderedVariants = useMemo(() => {
    if (!comparison) return []
    const byId = new Map(comparison.variants.map((variant) => [variant.variantId, variant]))
    return comparison.experiment.variants
      .map((variant) => ({ variant, comparison: byId.get(variant.id) }))
      .filter(
        (
          entry,
        ): entry is {
          variant: (typeof comparison.experiment.variants)[number]
          comparison: NonNullable<ReturnType<typeof byId.get>>
        } => entry.comparison !== undefined,
      )
      .sort((a, b) => Number(b.comparison.baseline) - Number(a.comparison.baseline))
  }, [comparison])

  // The body renders from the comparison read, so it stays in skeletons until that first resolves.
  // Gating on the cheap experiment query instead would flash the empty state: that query populates
  // `experiment` first, while `comparison` (and thus `orderedVariants`) is still empty.
  const isLoading = comparisonQuery.isLoading
  const atMaxVariants = (experiment?.variants.length ?? 0) >= MAX_VARIANTS_PER_EXPERIMENT

  return (
    <Layout>
      <Layout.Content>
        <Layout.Header
          title={
            <div className="flex min-w-0 flex-row items-center gap-3">
              <Tooltip
                asChild
                side="bottom"
                trigger={
                  <Button asChild variant="ghost" className="h-8 w-8 p-0" aria-label="Back to experiments">
                    <Link to="/projects/$projectSlug/experiments" params={{ projectSlug: project.slug }}>
                      <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </Button>
                }
              >
                Back to experiments
              </Tooltip>
              {experiment ? (
                <Text.H4M className="min-w-0 truncate">{experiment.name}</Text.H4M>
              ) : (
                <Skeleton className="h-7 w-56" />
              )}
            </div>
          }
          description={experiment?.description || undefined}
          actions={
            experiment ? (
              <>
                <ButtonGroup>
                  <Button
                    className="rounded-r-none before:hidden"
                    onClick={() => void actions.addVariant()}
                    disabled={atMaxVariants || actions.isPending}
                  >
                    <Icon icon={PlusIcon} size="sm" />
                    Variant
                  </Button>
                  <DropdownMenuRoot modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="rounded-l-none border-l border-primary-foreground/25 px-1.5 before:hidden"
                        disabled={atMaxVariants || actions.isPending}
                        aria-label="More add-variant options"
                      >
                        <Icon icon={ChevronDownIcon} size="sm" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          className="cursor-pointer items-center gap-2"
                          onSelect={() => setImportOpen(true)}
                        >
                          <Icon icon={BookmarkPlusIcon} size="sm" color="foregroundMuted" />
                          <Text.H5>Import from search</Text.H5>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenuPortal>
                  </DropdownMenuRoot>
                </ButtonGroup>
                <DropdownMenuRoot modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-8 w-8 p-0" aria-label="Experiment actions">
                      <Icon icon={EllipsisVerticalIcon} size="sm" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        className="cursor-pointer items-center gap-2"
                        onSelect={() => setRenameOpen(true)}
                      >
                        <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
                        <Text.H5>Rename</Text.H5>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="cursor-pointer items-center gap-2"
                        onSelect={() => setDeleteOpen(true)}
                      >
                        <Icon icon={Trash2Icon} size="sm" color="destructive" />
                        <Text.H5 color="destructive">Remove</Text.H5>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenuRoot>
              </>
            ) : undefined
          }
        />

        {/* Most of the left gutter is a margin (not padding) so horizontally-scrolled content clips
            near the sticky baseline column's edge instead of showing through the padding strip; the
            table keeps the last 8px as padding so the shader's outer bleed isn't clipped. */}
        <div className={cn("min-h-0 flex-1 overflow-auto", !isLoading && orderedVariants.length > 0 && "ml-4")}>
          {isLoading ? (
            <div className="mx-6 mt-1 mb-6 flex flex-col overflow-hidden rounded-xl border">
              <Skeleton className="h-12 w-full rounded-none" />
              <Skeleton className="h-56 w-full rounded-none border-t" />
              <Skeleton className="h-40 w-full rounded-none border-t" />
              {["sessions", "users", "tools", "signals", "behaviours"].map((entity) => (
                <Skeleton key={entity} className="h-11 w-full rounded-none border-t" />
              ))}
            </div>
          ) : orderedVariants.length === 0 ? (
            <ExperimentVariantsEmptyState
              disabled={actions.isPending}
              onAddVariant={() => void actions.addVariant()}
              onImportFromSearch={() => setImportOpen(true)}
            />
          ) : (
            <ComparisonTable
              projectId={project.id}
              projectSlug={project.slug}
              entries={orderedVariants}
              actions={actions}
              openEntities={openMetricEntities}
              onToggleEntity={toggleMetricEntity}
            />
          )}
        </div>

        {renameOpen && experiment ? (
          <ExperimentRenameModal
            projectId={project.id}
            experiment={experiment}
            onClose={() => setRenameOpen(false)}
            onRenamed={(updated) =>
              void navigate({
                to: "/projects/$projectSlug/experiments/$experimentSlug",
                params: { projectSlug: project.slug, experimentSlug: updated.slug },
              })
            }
          />
        ) : null}
        {importOpen ? (
          <VariantImportFromSearchModal
            projectId={project.id}
            title="Add variant from a saved search"
            description="Create a new variant from a saved search's filters and query."
            confirmLabel="Add variant"
            onImport={(filterSet, query, timeRange) => actions.addVariantFromSearch(filterSet, query, timeRange)}
            onClose={() => setImportOpen(false)}
          />
        ) : null}
        <ExperimentDeleteConfirmModal
          projectId={project.id}
          experiment={deleteOpen && experiment ? experiment : null}
          onOpenChange={(next) => setDeleteOpen(next !== null)}
          onDeleted={() =>
            void navigate({ to: "/projects/$projectSlug/experiments", params: { projectSlug: project.slug } })
          }
        />
      </Layout.Content>
    </Layout>
  )
}
