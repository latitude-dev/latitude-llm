import { Button, Icon, Text, useToast } from "@repo/ui"
import { RotateCwIcon } from "lucide-react"
import { useState } from "react"
import {
  useProjectAgentScore,
  useProjectAgentScoreExplanation,
  useProjectAgentScoreHistory,
} from "../../../../../../domains/agent-score/agent-score.collection.ts"
import { refreshProjectAgentScore } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { SectionHeader } from "../../-components/section-header.tsx"
import type { useRouteProject } from "../../-route-data.ts"
import { formatCount, SCORE_DIMENSION_ORDER, type ScoreDimensionKey } from "./agent-score-format.ts"
import { agentScoreRefreshMarker, waitForAgentScoreRefresh } from "./agent-score-refresh.ts"
import { AgentVitality } from "./agent-vitality.tsx"
import { buildDimensionEvidence, type DimensionEvidence } from "./dimension-evidence.ts"
import { DimensionSection, DimensionSectionSkeleton } from "./dimension-section.tsx"
import { dimensionReadiness } from "./score-readiness.ts"
import { ScoreTrend } from "./score-trend.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

const DIMENSION_META: Record<ScoreDimensionKey, { readonly title: string; readonly description: string }> = {
  outcome: { title: "Outcome quality", description: "Did users get what they came for?" },
  reliability: { title: "Reliability", description: "Can the agent complete sessions without terminal failures?" },
  cost: { title: "Cost", description: "Does the agent use model spend and context efficiently?" },
  speed: { title: "Speed", description: "How quickly does the agent complete user-visible work?" },
  safety: { title: "Safety", description: "Does the agent avoid causing harm?" },
}

const EMPTY_EVIDENCE: DimensionEvidence = { affected: [], coverageGaps: [], healthy: [], context: [] }

export function AgentScorePage({ project }: { readonly project: RouteProject }) {
  const { toast } = useToast()
  const [isReloading, setIsReloading] = useState(false)
  const scoreQuery = useProjectAgentScore(project.id)
  const historyQuery = useProjectAgentScoreHistory(project.id)
  const explanationQuery = useProjectAgentScoreExplanation(project.id)
  const current = scoreQuery.data
  const snapshot = current?.snapshot ?? null
  const explanation = explanationQuery.data?.explanation ?? null
  const date = current?.date ?? new Date().toISOString().slice(0, 10)
  const isRefreshing = scoreQuery.isRefetching || historyQuery.isRefetching || explanationQuery.isRefetching
  const refresh = async () => {
    if (isReloading) return
    const previousMarker = agentScoreRefreshMarker({ snapshot, explanation })
    const previousSnapshotMarker = `${snapshot?.date ?? "none"}:${snapshot?.score ?? "none"}`
    const previousExplanationTime = explanation?.computedAt
    setIsReloading(true)
    try {
      await refreshProjectAgentScore({ data: { projectId: project.id } })
      const completed = await waitForAgentScoreRefresh({
        previousMarker,
        refetch: async () => {
          const [scoreResult, explanationResult] = await Promise.all([scoreQuery.refetch(), explanationQuery.refetch()])
          const nextSnapshot = scoreResult.data?.snapshot ?? null
          const nextExplanation = explanationResult.data?.explanation ?? null
          const nextSnapshotMarker = `${nextSnapshot?.date ?? "none"}:${nextSnapshot?.score ?? "none"}`
          const nextMarker = agentScoreRefreshMarker({ snapshot: nextSnapshot, explanation: nextExplanation })
          const snapshotChanged = nextSnapshotMarker !== previousSnapshotMarker
          const explanationChanged = nextExplanation?.computedAt !== previousExplanationTime
          const explanationFinished = nextExplanation?.publication.status === "withheld" || nextSnapshot !== null
          return snapshotChanged || (explanationChanged && explanationFinished) ? nextMarker : previousMarker
        },
      })
      await historyQuery.refetch()
      if (!completed) {
        toast({
          title: "Agent Score is still refreshing",
          description: "The calculation is taking longer than expected. Try refreshing again in a few minutes.",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not refresh the Agent Score",
        description: toUserMessage(error),
      })
    } finally {
      setIsReloading(false)
    }
  }

  return (
    <Layout className="overflow-y-auto gap-12">
      <Layout.Content>
        <Layout.Header
          title={
            <SectionHeader
              title="Agent Score"
              description="See the agent's overall health and what affects each score."
            />
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={isReloading || isRefreshing}
              onClick={() => void refresh()}
            >
              <Icon icon={RotateCwIcon} size="sm" />
              Refresh
            </Button>
          }
        />
        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="flex flex-row gap-3 @max-[64rem]:flex-col">
            <AgentVitality
              snapshot={snapshot}
              history={historyQuery.data}
              dimensionWeights={current?.dimensionWeights}
              isLoading={isReloading || scoreQuery.isLoading || (!snapshot && explanationQuery.isLoading)}
              explanation={explanation}
            />
            <ScoreTrend endDate={date} history={historyQuery.data} isLoading={isReloading || historyQuery.isLoading} />
          </div>

          <div className="flex flex-col gap-3">
            {isReloading || explanationQuery.isLoading
              ? SCORE_DIMENSION_ORDER.map((dimension) => <DimensionSectionSkeleton key={dimension} />)
              : SCORE_DIMENSION_ORDER.map((dimension) => {
                  const meta = DIMENSION_META[dimension]
                  const evidence = explanation
                    ? buildDimensionEvidence({ dimension, snapshot, explanation })
                    : EMPTY_EVIDENCE
                  const affected = [...evidence.affected].sort(
                    (left, right) => Number(Boolean(left.signalId)) - Number(Boolean(right.signalId)),
                  )
                  const unavailableReason =
                    snapshot || !explanation
                      ? undefined
                      : dimensionReadiness(
                          explanation.publication.dimensions.find((entry) => entry.scoreDimension === dimension),
                          explanation,
                        )
                  return (
                    <DimensionSection
                      key={dimension}
                      id={dimension}
                      title={meta.title}
                      description={meta.description}
                      {...(unavailableReason ? { unavailableReason } : {})}
                      score={snapshot?.dimensions[dimension]?.score ?? null}
                      projectId={project.id}
                      projectSlug={project.slug}
                      affected={affected}
                      healthy={evidence.healthy}
                      context={evidence.context}
                      coverage={evidence.coverageGaps}
                      emptyAffectedMessage={
                        explanation
                          ? "No material issues affected this score in the current window."
                          : "Evidence has not been prepared for the current window yet."
                      }
                    />
                  )
                })}
          </div>

          {explanation && !isReloading ? (
            <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1 px-1">
              <Text.H7 color="foregroundMuted">
                Evidence updated {new Date(explanation.computedAt).toLocaleString()}
              </Text.H7>
              <Text.H7 color="foregroundMuted">·</Text.H7>
              <Text.H7 color="foregroundMuted">{formatCount(explanation.readSessionCount)} sessions read</Text.H7>
              {explanation.coverage.unmeasuredSignalEffects > 0 ? (
                <>
                  <Text.H7 color="foregroundMuted">·</Text.H7>
                  <Text.H7 color="foregroundMuted">
                    {formatCount(explanation.coverage.unmeasuredSignalEffects)} signal effects remain unmeasured
                  </Text.H7>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </Layout.Content>
    </Layout>
  )
}
