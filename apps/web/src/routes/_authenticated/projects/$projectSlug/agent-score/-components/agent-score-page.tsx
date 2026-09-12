import { Button, Icon, Text } from "@repo/ui"
import { RotateCwIcon } from "lucide-react"
import {
  useProjectAgentScore,
  useProjectAgentScoreExplanation,
  useProjectAgentScoreHistory,
} from "../../../../../../domains/agent-score/agent-score.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { SectionHeader } from "../../-components/section-header.tsx"
import type { useRouteProject } from "../../-route-data.ts"
import { formatCount, SCORE_DIMENSION_ORDER, type ScoreDimensionKey } from "./agent-score-format.ts"
import { AgentVitality } from "./agent-vitality.tsx"
import { buildDimensionEvidence, type DimensionEvidence } from "./dimension-evidence.ts"
import { DimensionSection, DimensionSectionSkeleton } from "./dimension-section.tsx"
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
  const scoreQuery = useProjectAgentScore(project.id)
  const historyQuery = useProjectAgentScoreHistory(project.id)
  const explanationQuery = useProjectAgentScoreExplanation(project.id)
  const current = scoreQuery.data
  const snapshot = current?.snapshot ?? null
  const explanation = explanationQuery.data?.explanation ?? null
  const date = current?.date ?? new Date().toISOString().slice(0, 10)
  const isRefreshing = scoreQuery.isRefetching || historyQuery.isRefetching || explanationQuery.isRefetching
  const refresh = () => Promise.all([scoreQuery.refetch(), historyQuery.refetch(), explanationQuery.refetch()])

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
            <Button type="button" variant="outline" size="sm" isLoading={isRefreshing} onClick={() => void refresh()}>
              <Icon icon={RotateCwIcon} size="sm" />
              Refresh
            </Button>
          }
        />
        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="flex flex-row gap-3 @max-[64rem]:flex-col">
            <AgentVitality
              date={date}
              snapshot={snapshot}
              history={historyQuery.data}
              dimensionWeights={current?.dimensionWeights}
              isLoading={scoreQuery.isLoading}
            />
            <ScoreTrend endDate={date} history={historyQuery.data} isLoading={historyQuery.isLoading} />
          </div>

          <div className="flex flex-col gap-3">
            {explanationQuery.isLoading
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
