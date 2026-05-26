import { Button, Card, CardContent, Icon, Skeleton } from "@repo/ui"
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
import { useMemo, useState } from "react"
import { useTaxonomyOverview } from "../../../../../../domains/taxonomy/taxonomy.collection.ts"
import type { TaxonomyOverviewRecord } from "../../../../../../domains/taxonomy/taxonomy.functions.ts"

const numberFormatter = new Intl.NumberFormat()
const formatCount = (value: number): string => numberFormatter.format(value)

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
  const recommendations = useMemo(() => shuffle(namedTopClusters).slice(0, 4), [namedTopClusters])
  const trendByClusterId = useMemo(
    () => new Map(namedTopClusters.map((cluster) => [cluster.id, cluster.trend] as const)),
    [namedTopClusters],
  )
  const categoryNameById = useMemo(
    () => new Map((data?.categories ?? []).map((item) => [item.category.id, item.category.name])),
    [data?.categories],
  )

  if (isLoading) return <LiveTaxonomySkeleton />
  if (!data || recommendations.length === 0) return null

  return (
    <section className="mx-auto grid w-full max-w-4xl px-6 pb-8">
      <div
        className={`col-start-1 row-start-1 transition-all duration-200 ease-out ${
          showAllBehaviors ? "pointer-events-none scale-[0.99] opacity-0" : "scale-100 opacity-100"
        }`}
        aria-hidden={showAllBehaviors}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {recommendations.map((cluster) => (
            <RecommendationCard
              key={cluster.id}
              cluster={cluster}
              projectSlug={projectSlug}
              categoryName={cluster.parentCategoryId ? categoryNameById.get(cluster.parentCategoryId) : undefined}
            />
          ))}
        </div>
        {data.totalActiveClusters > recommendations.length ? (
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
      >
        {showAllBehaviors ? (
          <AllBehaviorsList
            data={data}
            projectSlug={projectSlug}
            trendByClusterId={trendByClusterId}
            onShowRecommendations={() => setShowAllBehaviors(false)}
          />
        ) : null}
      </div>
    </section>
  )
}

function AllBehaviorsList({
  data,
  projectSlug,
  trendByClusterId,
  onShowRecommendations,
}: {
  readonly data: TaxonomyOverviewRecord
  readonly projectSlug: string
  readonly trendByClusterId: ReadonlyMap<string, RecommendationCluster["trend"]>
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
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatCount(item.category.observationCount)} sessions
                </span>
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
                            {cluster.description || `${formatCount(cluster.observationCount)} sessions`}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {trendByClusterId.get(cluster.id) ? (
                              <ClusterTag
                                icon={trendMeta(trendByClusterId.get(cluster.id)?.status ?? "steady").icon}
                                label={trendMeta(trendByClusterId.get(cluster.id)?.status ?? "steady").label}
                              />
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {formatCount(cluster.observationCount)} sessions
                            </span>
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

function LiveTaxonomySkeleton() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col px-6 pb-8">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    </section>
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
  }
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
            {cluster.description || `${formatCount(cluster.observationCount)} matching sessions`}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <ClusterTag icon={trendMeta(cluster.trend.status).icon} label={trendMeta(cluster.trend.status).label} />
            {categoryName ? <ClusterTag icon={TagIcon} label={categoryName} /> : null}
            <span className="text-xs text-muted-foreground">{formatCount(cluster.observationCount)} sessions</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
