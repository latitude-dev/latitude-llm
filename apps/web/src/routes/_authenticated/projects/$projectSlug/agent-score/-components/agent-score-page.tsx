import { Skeleton, Text } from "@repo/ui"
import {
  useProjectAgentScore,
  useProjectAgentScoreExplanation,
  useProjectAgentScoreHistory,
} from "../../../../../../domains/agent-score/agent-score.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { SectionHeader } from "../../-components/section-header.tsx"
import type { useRouteProject } from "../../-route-data.ts"
import { AgentScoreHeadline } from "./agent-score-header.tsx"
import { AgentScoreUnavailable } from "./agent-score-unavailable.tsx"
import { CauseRows } from "./cause-rows.tsx"
import { CoveragePanel } from "./coverage-panel.tsx"
import { DimensionStrip } from "./dimension-strip.tsx"
import { ScoreTrend } from "./score-trend.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

function Block({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {children}
    </div>
  )
}

/**
 * The project's Agent Score.
 *
 * Three reads, deliberately separate. The score and the trend come from stored snapshots and paint
 * immediately; the explanation comes from a cache the daily job warms and arrives when it arrives,
 * because computing one means reading every session in the window. A page that waited on that would
 * look broken, and a page that hid its scores until it finished would be worse.
 */
export function AgentScorePage({ project }: { readonly project: RouteProject }) {
  const { data: current, isLoading: scoreLoading } = useProjectAgentScore(project.id)
  const { data: history, isLoading: historyLoading } = useProjectAgentScoreHistory(project.id)
  const { data: explanation, isLoading: explanationLoading } = useProjectAgentScoreExplanation(project.id)

  const snapshot = current?.snapshot ?? null

  return (
    <Layout className="overflow-y-auto gap-6">
      <Layout.Content>
        <Layout.Header
          title={
            <SectionHeader
              title="Agent Score"
              description="One number for how this agent is doing in production, from a rolling window of real sessions. It is published only when all five dimensions can be measured."
            />
          }
        />
        <div className="flex flex-col gap-8 px-6 pb-6">
          {scoreLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : snapshot ? (
            <div className="flex flex-col gap-6">
              <AgentScoreHeadline snapshot={snapshot} />
              <DimensionStrip snapshot={snapshot} />
            </div>
          ) : (
            <AgentScoreUnavailable
              date={current?.date ?? new Date().toISOString().slice(0, 10)}
              hasHistory={(history?.length ?? 0) > 0}
            />
          )}

          <Block label="Trend">
            <ScoreTrend history={history} isLoading={historyLoading} />
          </Block>

          <Block label="What explains it">
            <CauseRows explanation={explanation} isLoading={explanationLoading} />
          </Block>

          <Block label="Coverage">
            <CoveragePanel explanation={explanation} />
          </Block>
        </div>
      </Layout.Content>
    </Layout>
  )
}
