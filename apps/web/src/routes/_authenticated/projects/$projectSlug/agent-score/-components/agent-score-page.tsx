import { Alert, Button, Icon, Status, Text, useToast } from "@repo/ui"
import { Loader2Icon, RotateCwIcon } from "lucide-react"
import { useState } from "react"
import {
  useProjectAgentScore,
  useProjectAgentScoreComputation,
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
  agentVitalityIsLoading,
  isCurrentAgentScoreSnapshot,
} from "./agent-score-refresh.ts"
import { AgentVitality } from "./agent-vitality.tsx"
import { buildDimensionEvidence, type DimensionEvidence } from "./dimension-evidence.ts"
import { DIMENSION_META } from "./dimension-meta.ts"
import { DimensionSection, DimensionSectionSkeleton } from "./dimension-section.tsx"
import { ScoreDateNavigator } from "./score-date-navigator.tsx"
import { ScoreTrend } from "./score-trend.tsx"

type RouteProject = Pick<ReturnType<typeof useRouteProject>, "id" | "slug">

const EMPTY_EVIDENCE: DimensionEvidence = { affected: [], coverageGaps: [], healthy: [], context: [] }

const scoreTrendIsLoading = ({
  isHistoryLoading,
  isExplanationLoading,
  isCurrentSnapshot,
}: {
  readonly isHistoryLoading: boolean
  readonly isExplanationLoading: boolean
  readonly isCurrentSnapshot: boolean
}): boolean => isHistoryLoading || (!isCurrentSnapshot && isExplanationLoading)

export function AgentScorePage({
  project,
  selectedDate,
  onDateChange,
}: {
  readonly project: RouteProject
  readonly selectedDate?: string | undefined
  readonly onDateChange: (date: string) => void
}) {
  const { toast } = useToast()
  const [isStartingRefresh, setIsStartingRefresh] = useState(false)
  const computationQuery = useProjectAgentScoreComputation(project.id, selectedDate)
  const computationMarker = computationQuery.data?.marker ?? "none"
  const isComputing = computationQuery.data?.status === "computing"
  const scoreQuery = useProjectAgentScore(project.id, selectedDate, computationMarker)
  const scoreData = scoreQuery.data
  const date = scoreData?.date ?? selectedDate
  const historyQuery = useProjectAgentScoreHistory(project.id, date, computationMarker)
  const explanationQuery = useProjectAgentScoreExplanation(project.id, date, computationMarker)
  const snapshot = scoreData?.snapshot ?? null
  const displayDate = date ?? new Date().toISOString().slice(0, 10)
  const isCurrentSnapshot = isCurrentAgentScoreSnapshot(snapshot, displayDate)
  const explanation = agentScoreExplanationForSnapshot({
    explanation: explanationQuery.data?.explanation ?? null,
    date: displayDate,
    snapshot,
  })
  const refresh = async () => {
    if (isStartingRefresh || isComputing) return
    if (!date) {
      await scoreQuery.refetch()
      return
    }
    setIsStartingRefresh(true)
    try {
      await refreshProjectAgentScore({ data: { projectId: project.id, date } })
      await computationQuery.refetch()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not refresh the Agent Score",
        description: toUserMessage(error),
      })
    } finally {
      setIsStartingRefresh(false)
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
            <div className="flex flex-wrap items-center gap-2">
              <ScoreDateNavigator date={date} onDateChange={onDateChange} disabled={isStartingRefresh} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={computationQuery.isLoading || scoreQuery.isLoading || isComputing}
                isLoading={isStartingRefresh}
                onClick={() => void refresh()}
              >
                <Icon icon={RotateCwIcon} size="sm" />
                Refresh
              </Button>
            </div>
          }
        />
        <div className="flex flex-col gap-6 px-6 pb-6">
          {isComputing ? (
            <Alert
              showIcon={false}
              title="Computing Agent Score"
              description="This can take several minutes. You can leave this page and return later."
              cta={
                <Status
                  variant="info"
                  label="In progress"
                  indicator={<Icon icon={Loader2Icon} size="xs" className="animate-spin" />}
                />
              }
            />
          ) : null}
          {[computationQuery.isError, scoreQuery.isError, historyQuery.isError, explanationQuery.isError].some(
            Boolean,
          ) ? (
            <Text.H6 color="destructive">Some score data could not be loaded. Refresh to try again.</Text.H6>
          ) : null}
          <div className="flex flex-row gap-3 @max-[64rem]:flex-col">
            <AgentVitality
              snapshot={snapshot}
              history={historyQuery.data}
              dimensionWeights={scoreData?.dimensionWeights}
              explanation={explanation}
              isLoading={agentVitalityIsLoading(snapshot, scoreQuery.isLoading || explanationQuery.isLoading)}
            />
            <ScoreTrend
              endDate={displayDate}
              isCurrentSnapshot={isCurrentSnapshot}
              history={historyQuery.data}
              explanation={explanation}
              isLoading={scoreTrendIsLoading({
                isHistoryLoading: scoreQuery.isLoading || historyQuery.isLoading,
                isExplanationLoading: explanationQuery.isLoading,
                isCurrentSnapshot,
              })}
            />
          </div>

          <div className="flex flex-col gap-3">
            {scoreQuery.isLoading || explanationQuery.isLoading
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
                          : "Evidence is not available for this date."
                      }
                    />
                  )
                })}
          </div>

          {explanation ? (
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
