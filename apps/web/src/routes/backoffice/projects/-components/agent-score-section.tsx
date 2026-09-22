import { Badge, Icon, Text } from "@repo/ui"
import { GaugeIcon } from "lucide-react"
import type { AdminAgentScoreDto } from "../../../../domains/admin/agent-score.functions.ts"
import { AgentVitality } from "../../../_authenticated/projects/$projectSlug/agent-score/-components/agent-vitality.tsx"
import { DashboardSection } from "../../-components/dashboard/index.ts"
import { AgentScoreTrend } from "./agent-score-trend.tsx"

const formatScore = (score: number): string => score.toFixed(0)

export function AgentScoreSection({ agentScore }: { readonly agentScore: AdminAgentScoreDto }) {
  const snapshot = agentScore.snapshot

  return (
    <DashboardSection
      title={
        <span className="flex items-center gap-2">
          <Icon icon={GaugeIcon} size="sm" />
          <Text.H6 weight="semibold">Agent Score</Text.H6>
        </span>
      }
      aside={
        <Badge variant={agentScore.customerAccessEnabled ? "outlineSuccessMuted" : "outlineMuted"}>
          Customer access {agentScore.customerAccessEnabled ? "enabled" : "disabled"}
        </Badge>
      }
    >
      {snapshot ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <AgentVitality
              snapshot={snapshot}
              history={agentScore.history}
              dimensionWeights={agentScore.dimensionWeights}
              explanation={agentScore.explanation}
              isLoading={false}
            />
            <AgentScoreTrend endDate={agentScore.currentDate} history={agentScore.history} />
          </div>

          {snapshot.policyCap !== null ? (
            <Text.H7 color="warningMutedForeground">Policy cap applied at {formatScore(snapshot.policyCap)}.</Text.H7>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border border-dashed border-border bg-muted/30 p-4">
          <Text.H6 weight="medium">No published Agent Score yet.</Text.H6>
          <Text.H6 color="foregroundMuted">
            No snapshot has been stored. The project may not yet meet the session and dimension requirements needed to
            publish a score.
          </Text.H6>
        </div>
      )}
    </DashboardSection>
  )
}
