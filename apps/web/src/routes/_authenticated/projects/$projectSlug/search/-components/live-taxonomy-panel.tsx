import { Button, Card, CardContent, Icon, Tooltip, useMountEffect } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  ChevronDownIcon,
  FlameIcon,
  MinusIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
} from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useTaxonomyOverview } from "../../../../../../domains/taxonomy/taxonomy.collection.ts"
import type { TaxonomyOverviewRecord } from "../../../../../../domains/taxonomy/taxonomy.functions.ts"

const numberFormatter = new Intl.NumberFormat("en-US")
const compactNumberFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const COMPACT_SESSION_COUNT_THRESHOLD = 100_000
const RECOMMENDATION_ROTATION_INITIAL_DELAY_MS = 10_000
const RECOMMENDATION_ROTATION_INTERVAL_MS = 5_000
const RECOMMENDATION_FADE_MS = 500
const RECOMMENDATION_COUNT = 4

const formatCount = (value: number): string => numberFormatter.format(value)
const formatDisplayCount = (value: number): string =>
  value >= COMPACT_SESSION_COUNT_THRESHOLD ? compactNumberFormatter.format(value) : formatCount(value)
const formatSessionLabel = (value: number, display: "compact" | "full" = "compact"): string => {
  const count = display === "compact" ? formatDisplayCount(value) : formatCount(value)
  return `${count} session${value === 1 ? "" : "s"}`
}

function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex] as T
    shuffled[swapIndex] = current as T
  }
  return shuffled
}

export function LiveTaxonomyPanel({
  projectId,
  projectSlug,
}: {
  readonly projectId: string
  readonly projectSlug: string
}) {
  const { data, isLoading } = useTaxonomyOverview(projectId)
  const [showAllBehaviors, setShowAllBehaviors] = useState(false)
  const namedTopClusters = useMemo(
    () => (data?.topClusters ?? []).filter((cluster) => cluster.name !== "Pending"),
    [data?.topClusters],
  )
  const shuffledTopClusters = useMemo(() => shuffle(namedTopClusters), [namedTopClusters])
  const categoryNameById = useMemo(
    () => new Map((data?.categories ?? []).map((item) => [item.category.id, item.category.name])),
    [data?.categories],
  )

  if (isLoading || !data || shuffledTopClusters.length === 0) return null

  return (
    <section className="mx-auto grid w-full max-w-4xl px-6 pb-8">
      <div
        className={`col-start-1 row-start-1 transition-all duration-200 ease-out ${
          showAllBehaviors ? "pointer-events-none scale-[0.99] opacity-0" : "scale-100 opacity-100"
        }`}
        aria-hidden={showAllBehaviors}
        inert={showAllBehaviors || undefined}
      >
        <RotatingRecommendationGrid
          key={shuffledTopClusters.map((cluster) => cluster.id).join(":")}
          clusters={shuffledTopClusters}
          projectSlug={projectSlug}
          categoryNameById={categoryNameById}
        />
        {data.totalActiveClusters > RECOMMENDATION_COUNT ? (
          <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setShowAllBehaviors(true)}>
              See all behaviors & categories
            </Button>
          </div>
        ) : null}
      </div>
      <div
        className={`col-start-1 row-start-1 transition-all duration-200 ease-out ${
          showAllBehaviors ? "scale-100 opacity-100" : "pointer-events-none scale-[0.99] opacity-0"
        }`}
        aria-hidden={!showAllBehaviors}
        inert={!showAllBehaviors || undefined}
      >
        {showAllBehaviors ? (
          <AllBehaviorsList
            data={data}
            projectSlug={projectSlug}
            onShowRecommendations={() => setShowAllBehaviors(false)}
          />
        ) : null}
      </div>
    </section>
  )
}

function RotatingRecommendationGrid({
  clusters,
  projectSlug,
  categoryNameById,
}: {
  readonly clusters: readonly RecommendationCluster[]
  readonly projectSlug: string
  readonly categoryNameById: ReadonlyMap<string, string>
}) {
  const slotCount = Math.min(RECOMMENDATION_COUNT, clusters.length)
  const [slots, setSlots] = useState(() =>
    Array.from({ length: slotCount }, (_, index) => ({ clusterIndex: index, visible: true })),
  )
  const nextClusterIndex = useRef(slotCount)
  const lastRotatedSlotIndex = useRef<number | null>(null)

  useMountEffect(() => {
    if (clusters.length <= slotCount) return

    const timeouts: ReturnType<typeof setTimeout>[] = []
    const chooseSlotIndex = () => {
      if (slotCount <= 1) return 0

      let slotIndex = Math.floor(Math.random() * slotCount)
      while (slotIndex === lastRotatedSlotIndex.current) {
        slotIndex = Math.floor(Math.random() * slotCount)
      }
      lastRotatedSlotIndex.current = slotIndex
      return slotIndex
    }
    const rotateOneSlot = () => {
      const slotIndex = chooseSlotIndex()
      setSlots((previous) => previous.map((slot, index) => (index === slotIndex ? { ...slot, visible: false } : slot)))

      const fadeTimeout = setTimeout(() => {
        setSlots((previous) => {
          const visibleClusterIndexes = new Set(previous.map((slot) => slot.clusterIndex))
          visibleClusterIndexes.delete(previous[slotIndex]?.clusterIndex)

          let candidateIndex = nextClusterIndex.current % clusters.length
          while (visibleClusterIndexes.has(candidateIndex)) {
            nextClusterIndex.current += 1
            candidateIndex = nextClusterIndex.current % clusters.length
          }
          nextClusterIndex.current += 1

          return previous.map((slot, index) =>
            index === slotIndex ? { clusterIndex: candidateIndex, visible: true } : slot,
          )
        })
      }, RECOMMENDATION_FADE_MS)
      timeouts.push(fadeTimeout)
    }

    const initialTimeout = setTimeout(() => {
      rotateOneSlot()
      const interval = setInterval(rotateOneSlot, RECOMMENDATION_ROTATION_INTERVAL_MS)
      timeouts.push(interval)
    }, RECOMMENDATION_ROTATION_INITIAL_DELAY_MS)
    timeouts.push(initialTimeout)

    return () => {
      for (const timeout of timeouts) clearTimeout(timeout)
    }
  })

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {slots.map((slot, index) => {
        const cluster = clusters[slot.clusterIndex]
        if (!cluster) return null

        return (
          <div key={index} className={`transition-opacity duration-500 ${slot.visible ? "opacity-100" : "opacity-0"}`}>
            <RecommendationCard
              cluster={cluster}
              projectSlug={projectSlug}
              categoryName={cluster.parentCategoryId ? categoryNameById.get(cluster.parentCategoryId) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}

function AllBehaviorsList({
  data,
  projectSlug,
  onShowRecommendations,
}: {
  readonly data: TaxonomyOverviewRecord
  readonly projectSlug: string
  readonly onShowRecommendations: () => void
}) {
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<ReadonlySet<string>>(
    () => new Set(data.categories.map((item) => item.category.id)),
  )

  const toggleCategory = (categoryId: string) => {
    setExpandedCategoryIds((previous) => {
      const next = new Set(previous)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center pb-1">
        <Button variant="ghost" size="sm" onClick={onShowRecommendations}>
          Show recommendations
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {data.categories.map((item) => {
          const isExpanded = expandedCategoryIds.has(item.category.id)
          return (
            <div key={item.category.id} className="overflow-hidden rounded-xl bg-muted/25 transition-colors">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/50"
                onClick={() => toggleCategory(item.category.id)}
                aria-expanded={isExpanded}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon
                      icon={ChevronDownIcon}
                      size="xs"
                      color="foregroundMuted"
                      className={`shrink-0 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                    />
                    <div className="truncate text-sm font-medium text-foreground">{item.category.name}</div>
                  </div>
                  {item.category.description ? (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.category.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.trend ? (
                    <ClusterTag icon={trendMeta(item.trend.status).icon} label={trendMeta(item.trend.status).label} />
                  ) : null}
                  <SessionCount value={item.category.observationCount} />
                </div>
              </button>
              {isExpanded ? (
                <div className="grid grid-cols-1 gap-2 px-3 pb-3 md:grid-cols-2">
                  {item.clusters.map((cluster) => (
                    <Link
                      key={cluster.id}
                      to="/projects/$projectSlug/search"
                      params={{ projectSlug }}
                      search={{ q: cluster.name }}
                      className="group min-w-0 rounded-lg bg-background/80 p-3 transition-colors hover:bg-muted/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
                            {cluster.name}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
                            {cluster.description || formatSessionLabel(cluster.observationCount, "full")}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <ClusterTag
                              icon={trendMeta(cluster.trend.status).icon}
                              label={trendMeta(cluster.trend.status).label}
                            />
                            <SessionCount value={cluster.observationCount} />
                          </div>
                        </div>
                        <Icon
                          icon={ArrowUpRightIcon}
                          size="xs"
                          color="foregroundMuted"
                          className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type RecommendationCluster = TaxonomyOverviewRecord["topClusters"][number]

type TagIconType = typeof TagIcon

const trendMeta = (
  status: RecommendationCluster["trend"]["status"],
): { readonly label: string; readonly icon: TagIconType } => {
  switch (status) {
    case "new":
      return { label: "new", icon: SparklesIcon }
    case "spike":
      return { label: "spiking", icon: FlameIcon }
    case "rising":
      return { label: "rising", icon: ArrowUpIcon }
    case "steady":
      return { label: "steady", icon: MinusIcon }
    case "cooling":
      return { label: "cooling", icon: ArrowDownIcon }
    case "fading":
      return { label: "fading", icon: ArrowDownIcon }
    default: {
      const _exhaustiveCheck: never = status
      throw new Error(`Unhandled trend status: ${_exhaustiveCheck}`)
    }
  }
}

function SessionCount({ value }: { readonly value: number }) {
  const exactLabel = formatSessionLabel(value, "full")

  return (
    <Tooltip
      trigger={
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{formatSessionLabel(value)}</span>
      }
    >
      {exactLabel}
    </Tooltip>
  )
}

function ClusterTag({ icon, label }: { readonly icon: TagIconType; readonly label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-xs leading-5 text-muted-foreground">
      <Icon icon={icon} size="xs" color="foregroundMuted" />
      <span className="truncate">{label}</span>
    </span>
  )
}

function RecommendationCard({
  cluster,
  projectSlug,
  categoryName,
}: {
  readonly cluster: RecommendationCluster
  readonly projectSlug: string
  readonly categoryName: string | undefined
}) {
  return (
    <Link
      to="/projects/$projectSlug/search"
      params={{ projectSlug }}
      search={{ q: cluster.name }}
      className="group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Search traces for ${cluster.name}`}
    >
      <Card className="h-full min-h-36 min-w-0 border-transparent bg-muted/30 shadow-none transition-colors hover:bg-muted/50">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/70">
                <Icon icon={SearchIcon} size="xs" color="foregroundMuted" />
              </span>
              <div className="line-clamp-2 text-sm font-medium leading-5 text-foreground">{cluster.name}</div>
            </div>
            <Icon
              icon={ArrowUpRightIcon}
              size="xs"
              color="foregroundMuted"
              className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
            />
          </div>
          <p className="line-clamp-3 min-h-12 text-xs leading-4 text-muted-foreground">
            {cluster.description || `${formatSessionLabel(cluster.observationCount, "full")} matching`}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <ClusterTag icon={trendMeta(cluster.trend.status).icon} label={trendMeta(cluster.trend.status).label} />
            {categoryName ? <ClusterTag icon={TagIcon} label={categoryName} /> : null}
            <SessionCount value={cluster.observationCount} />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
