import { Badge, Icon, Text } from "@repo/ui"
import { GaugeIcon } from "lucide-react"
import type { AdminAgentScoreDto } from "../../../../domains/admin/agent-score.functions.ts"
import { AgentVitality } from "../../../_authenticated/projects/$projectSlug/agent-score/-components/agent-vitality.tsx"
import { DashboardSection } from "../../-components/dashboard/index.ts"
import { AgentScoreTrend } from "./agent-score-trend.tsx"

const formatScore = (score: number): string => score.toFixed(0)

/**
 * Agent Score at a glance, for staff.
 *
 * Two panels and nothing else: the vitality ring the customer sees, and the trend of published
 * scores beside it. The ring already carries the composite score, every dimension arc and — on
 * hover — the evidence behind each one, so a row of per-dimension tiles and a written-out cause
 * list underneath were repeating it in a slower form. What staff need that customers do not is the
 * customer-access badge in the header and the recalculation controls further down the page.
 */
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

          {/*
            Only ever rendered when a cap actually fired. A capped score is a clamped score, which is
            exactly the kind of exception a staff page must not swallow — but in the ordinary case it
            costs no row.
          */}
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
