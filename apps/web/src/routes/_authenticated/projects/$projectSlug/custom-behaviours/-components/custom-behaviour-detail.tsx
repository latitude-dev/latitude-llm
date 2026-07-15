import type { CustomBehaviorStatus } from "@domain/taxonomy"
import { Badge, type BadgeProps, Button, Icon, Text, useToast } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { AlertTriangleIcon, Loader2Icon, RefreshCwIcon, SparklesIcon } from "lucide-react"
import { useMemo } from "react"
import { summarizeFilterSet } from "../../../../../../components/filters-builder/filter-summary.ts"
import {
  useCustomBehaviorsList,
  useGenerateCustomBehavior,
} from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { useProjectBehaviours } from "../../../../../../domains/taxonomy/taxonomy.collection.ts"
import type { BehaviourMomentRangeRecord } from "../../../../../../domains/taxonomy/taxonomy.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import {
  findNodeById,
  findNodeByPath,
  isBehaviourTrajectoryMetric,
} from "../../behaviours/-components/behaviour-tree-nav.ts"
import { BehaviourDetailDrawer, BehavioursView } from "../../behaviours/-components/behaviours-view.tsx"

const STATUS_META: Record<CustomBehaviorStatus, { readonly label: string; readonly variant: BadgeProps["variant"] }> = {
  pending: { label: "Pending", variant: "muted" },
  generating: { label: "Generating", variant: "warningMuted" },
  ready: { label: "Ready", variant: "successMuted" },
  failed: { label: "Failed", variant: "destructiveMuted" },
}

function FilterSummary({ behaviour }: { readonly behaviour: CustomBehaviorRecord }) {
  const labels = summarizeFilterSet(behaviour.filterSet)
  if (labels.length === 0) return <Text.H6 color="foregroundMuted">All sessions</Text.H6>
  return (
    <div className="flex flex-row flex-wrap items-center gap-1">
      {labels.map((label) => (
        <Badge key={label} variant="muted" size="small">
          {label}
        </Badge>
      ))}
    </div>
  )
}

function CustomBehaviourTreePage({ behaviour }: { readonly behaviour: CustomBehaviorRecord }) {
  const { toast } = useToast()
  const generate = useGenerateCustomBehavior(behaviour.projectId)
  const [behaviourPathParam, setBehaviourPathParam] = useParamState("behaviourPath", "", { history: "push" })
  const [momentMetric, setMomentMetric] = useParamState("behaviourMomentMetric", "")
  const [momentTurnFrom, setMomentTurnFrom] = useParamState("behaviourMomentTurnFrom", "")
  const [momentTurnTo, setMomentTurnTo] = useParamState("behaviourMomentTurnTo", "")
  const [momentTurnMax, setMomentTurnMax] = useParamState("behaviourMomentTurnMax", "")

  const { data, isLoading } = useProjectBehaviours({
    projectId: behaviour.projectId,
    dimension: "topic",
    segment: "all",
    sortBy: "category",
    customBehaviorId: behaviour.id,
    poll: behaviour.status === "generating",
  })
  const topics = data?.topics ?? []

  const momentRange = useMemo((): BehaviourMomentRangeRecord | undefined => {
    if (!isBehaviourTrajectoryMetric(momentMetric)) return undefined
    const fromTurn = Number(momentTurnFrom)
    const toTurn = Number(momentTurnTo)
    if (!Number.isInteger(fromTurn) || !Number.isInteger(toTurn) || fromTurn < 0 || toTurn < fromTurn) return undefined
    return { metric: momentMetric, fromTurn, toTurn }
  }, [momentMetric, momentTurnFrom, momentTurnTo])
  const setMomentRangeWithMax = (range: BehaviourMomentRangeRecord | undefined, maxTurn?: number) => {
    setMomentMetric(range?.metric ?? "")
    setMomentTurnFrom(range ? String(range.fromTurn) : "")
    setMomentTurnTo(range ? String(range.toTurn) : "")
    setMomentTurnMax(range && maxTurn !== undefined ? String(Math.max(maxTurn, range.toTurn)) : "")
  }
  const parsedMomentTurnMax = Number(momentTurnMax)
  const momentRangeMaxTurn =
    momentRange && Number.isInteger(parsedMomentTurnMax) && parsedMomentTurnMax >= momentRange.toTurn
      ? parsedMomentTurnMax
      : (momentRange?.toTurn ?? 0)

  const behaviourPath = useMemo(
    () => (behaviourPathParam ? behaviourPathParam.split(".").filter(Boolean) : []),
    [behaviourPathParam],
  )
  const setBehaviourPath = (path: readonly string[]) => setBehaviourPathParam(path.join("."))
  const activeBehaviourId = behaviourPath.at(-1)
  const activeNode = useMemo(() => {
    if (!activeBehaviourId) return null
    return findNodeByPath(topics, behaviourPath) ?? findNodeById(topics, activeBehaviourId)
  }, [activeBehaviourId, behaviourPath, topics])

  const status = STATUS_META[behaviour.status]
  const isGenerating = behaviour.status === "generating"
  const neverGenerated = behaviour.status === "pending"
  const hasTree = topics.length > 0

  const runGenerate = async () => {
    try {
      await generate.mutateAsync(behaviour.id)
      toast({ description: "Generation started. The tree updates when it completes." })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Layout>
      <Layout.Content>
        <Layout.Header
          title={
            <div className="flex flex-row items-center gap-3">
              <Text.H4M>{behaviour.name}</Text.H4M>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          }
          description={<FilterSummary behaviour={behaviour} />}
          actions={
            <Button variant="default" onClick={() => void runGenerate()} disabled={isGenerating || generate.isPending}>
              <Icon size="sm" icon={neverGenerated ? SparklesIcon : RefreshCwIcon} />
              {isGenerating ? "Generating…" : neverGenerated ? "Generate" : "Regenerate"}
            </Button>
          }
        />
        {behaviour.status === "failed" ? (
          <div className="flex flex-row items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
            <Icon icon={AlertTriangleIcon} size="sm" color="destructive" />
            <Text.H6 color="destructive">
              The last generation failed. Showing the previous tree — regenerate to try again.
            </Text.H6>
          </div>
        ) : null}
        {isGenerating ? (
          <div className="flex flex-row items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2">
            <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
            <Text.H6 color="warningMutedForeground">
              Generating the scoped tree. Any existing tree stays visible until the new pass completes.
            </Text.H6>
          </div>
        ) : null}
        {isLoading || hasTree ? (
          <BehavioursView
            topics={topics}
            projectId={behaviour.projectId}
            isLoading={isLoading}
            behaviourPath={behaviourPath}
            timeFilter={null}
            timeRange={undefined}
            momentRange={momentRange}
            customBehaviorId={behaviour.id}
            onBehaviourPathChange={setBehaviourPath}
            onMomentRangeChange={setMomentRangeWithMax}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <Text.H4>No scoped tree yet</Text.H4>
            <Text.H5 color="foregroundMuted" centered>
              Generate to cluster this behavior's sessions into their own tree. Clustering runs over the last 7 days and
              needs enough matching observations.
            </Text.H5>
          </div>
        )}
      </Layout.Content>
      {activeNode ? (
        <Layout.Aside>
          <BehaviourDetailDrawer
            node={activeNode.node}
            parentName={activeNode.parent?.cluster.name ?? null}
            projectId={behaviour.projectId}
            timeRange={undefined}
            momentRange={momentRange}
            momentRangeMaxTurn={momentRangeMaxTurn}
            customBehaviorId={behaviour.id}
            onMomentRangeChange={setMomentRangeWithMax}
            onClose={() => {
              setBehaviourPath([])
              setMomentRangeWithMax(undefined)
            }}
          />
        </Layout.Aside>
      ) : null}
    </Layout>
  )
}

export function CustomBehaviourDetail({
  projectId,
  projectSlug,
  behaviourSlug,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly behaviourSlug: string
}) {
  const { data: behaviours, isLoading } = useCustomBehaviorsList(projectId)
  const behaviour = behaviours.find((candidate) => candidate.slug === behaviourSlug)

  if (behaviour) return <CustomBehaviourTreePage key={behaviour.id} behaviour={behaviour} />

  return (
    <Layout>
      <Layout.Content>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <Text.H3>Custom behavior not found</Text.H3>
            <Button asChild variant="outline">
              <Link to="/projects/$projectSlug/custom-behaviours" params={{ projectSlug }}>
                Back to custom behaviors
              </Link>
            </Button>
          </div>
        )}
      </Layout.Content>
    </Layout>
  )
}
