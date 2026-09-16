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
import { formatCount, SCORE_DIMENSION_ORDER } from "./agent-score-format.ts"
import {
  agentScoreExplanationForSnapshot,
  agentScoreRefreshCompleted,
  agentScoreRefreshMarker,
  agentScoreSnapshotMarker,
  agentVitalityIsLoading,
  isCurrentAgentScoreSnapshot,
  isStaleAgentScoreSnapshot,
  waitForAgentScoreRefresh,
} from "./agent-score-refresh.ts"
import { AgentVitality } from "./agent-vitality.tsx"
import { buildDimensionEvidence, type DimensionEvidence } from "./dimension-evidence.ts"
import { DIMENSION_META } from "./dimension-meta.ts"
import { DimensionSection, DimensionSectionSkeleton } from "./dimension-section.tsx"
import { ScoreTrend } from "./score-trend.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

const EMPTY_EVIDENCE: DimensionEvidence = { affected: [], coverageGaps: [], healthy: [], context: [] }

const scoreTrendIsLoading = ({
  isReloading,
  isHistoryLoading,
  isExplanationLoading,
  isCurrentSnapshot,
}: {
  readonly isReloading: boolean
  readonly isHistoryLoading: boolean
  readonly isExplanationLoading: boolean
  readonly isCurrentSnapshot: boolean
}): boolean => isReloading || isHistoryLoading || (!isCurrentSnapshot && isExplanationLoading)

export function AgentScorePage({ project }: { readonly project: RouteProject }) {
  const { toast } = useToast()
  const [isReloading, setIsReloading] = useState(false)
  const scoreQuery = useProjectAgentScore(project.id)
  const historyQuery = useProjectAgentScoreHistory(project.id)
  const explanationQuery = useProjectAgentScoreExplanation(project.id)
  const scoreData = scoreQuery.data
  const snapshot = scoreData?.snapshot ?? null
  const date = scoreData?.date ?? new Date().toISOString().slice(0, 10)
  const isCurrentSnapshot = isCurrentAgentScoreSnapshot(snapshot, date)
  const hasStaleSnapshot = isStaleAgentScoreSnapshot(snapshot, date)
  const cachedExplanation = explanationQuery.data?.currentExplanation ?? null
  const explanation = agentScoreExplanationForSnapshot({
    explanation: explanationQuery.data?.explanation ?? null,
    date: snapshot?.date ?? date,
    snapshot,
  })
  const isRefreshing = scoreQuery.isRefetching || historyQuery.isRefetching || explanationQuery.isRefetching
  const refresh = async () => {
    if (isReloading) return
    const previousMarker = agentScoreRefreshMarker({ snapshot, explanation: cachedExplanation })
    const previousSnapshotMarker = agentScoreSnapshotMarker(snapshot)
    const previousExplanationTime = cachedExplanation?.computedAt
    setIsReloading(true)
    try {
      const { date: refreshDate } = await refreshProjectAgentScore({ data: { projectId: project.id } })
      const completed = await waitForAgentScoreRefresh({
        previousMarker,
        refetch: async () => {
          const [scoreResult, explanationResult] = await Promise.all([scoreQuery.refetch(), explanationQuery.refetch()])
          const nextSnapshot = scoreResult.data?.snapshot ?? null
          const nextExplanation = explanationResult.data?.explanation ?? null
          const nextMarker = agentScoreRefreshMarker({ snapshot: nextSnapshot, explanation: nextExplanation })
          return agentScoreRefreshCompleted({
            previousSnapshotMarker,
            previousExplanationTime,
            date: refreshDate,
            snapshot: nextSnapshot,
            explanation: nextExplanation,
          })
            ? nextMarker
            : previousMarker
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
              date={date}
              history={historyQuery.data}
              dimensionWeights={scoreData?.dimensionWeights}
              explanation={explanation}
              isLoading={agentVitalityIsLoading(
                snapshot,
                isReloading || scoreQuery.isLoading || explanationQuery.isLoading,
              )}
            />
            <ScoreTrend
              endDate={date}
              isCurrentSnapshot={isCurrentSnapshot}
              hasStaleSnapshot={hasStaleSnapshot}
              history={historyQuery.data}
              explanation={explanation}
              isLoading={scoreTrendIsLoading({
                isReloading,
                isHistoryLoading: historyQuery.isLoading,
                isExplanationLoading: explanationQuery.isLoading,
                isCurrentSnapshot,
              })}
            />
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
                  return (
                    <DimensionSection
                      key={dimension}
                      id={dimension}
                      title={meta.title}
                      description={meta.description}
                      score={snapshot?.dimensions[dimension]?.score ?? null}
                      projectSlug={project.slug}
                      affected={affected}
                      healthy={evidence.healthy}
                      coverage={evidence.coverageGaps}
                      emptyAffectedMessage={
                        explanation
                          ? "No material issues affected this score."
                          : "Evidence has not been prepared for the latest score yet."
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
