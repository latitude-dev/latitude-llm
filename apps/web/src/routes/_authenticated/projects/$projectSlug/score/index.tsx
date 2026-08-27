import { Badge, Separator, Tooltip } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { SectionHeader } from "../-components/section-header.tsx"
import {
  type AgentScoreSnapshotKey,
  apdexDimensions,
  efficiencyDimension,
  findAgentScoreSnapshot,
  isAgentScoreSnapshotKey,
} from "./-components/agent-score-mock.ts"
import { DimensionSection } from "./-components/dimension-section.tsx"
import { DimensionSummaryPanel } from "./-components/dimension-summary-panel.tsx"
import { EfficiencySection } from "./-components/efficiency-section.tsx"
import { SafetyPanel } from "./-components/safety-panel.tsx"
import { ScoreHeadlinePanel } from "./-components/score-headline-panel.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/score/")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Agent Score</BreadcrumbText>,
  },
  component: AgentScorePage,
})

const DEFAULT_SNAPSHOT_KEY: AgentScoreSnapshotKey = "support"

function AgentScorePage() {
  const { projectSlug } = Route.useParams()
  // `?scoreMock=coding` and `?scoreMock=prelaunch` render the not-measured and below-floor states.
  const [snapshotKey] = useParamState<string, AgentScoreSnapshotKey>("scoreMock", DEFAULT_SNAPSHOT_KEY, {
    validate: isAgentScoreSnapshotKey,
  })
  const snapshot = findAgentScoreSnapshot(snapshotKey)
  const efficiency = efficiencyDimension(snapshot)

  return (
    <Layout>
      <Layout.Header
        title={
          <SectionHeader
            title="Agent Score"
            badge={
              <Tooltip
                asChild
                trigger={
                  <Badge variant="warningMuted" size="small" className="cursor-default">
                    Mock data
                  </Badge>
                }
              >
                A design mock with hardcoded numbers. Nothing here reads your project yet.
              </Tooltip>
            }
            description="What share of your sessions went cleanly, and what the rest cost you"
          />
        }
      />
      <div className="flex flex-col gap-6 px-6 pb-6">
        <div className="flex flex-col gap-2">
          <ScoreHeadlinePanel snapshot={snapshot} />
          <DimensionSummaryPanel snapshot={snapshot} />
        </div>
        <Separator />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(460px,1fr))] items-start gap-2">
          {apdexDimensions(snapshot).map((dimension) => (
            <DimensionSection key={dimension.key} dimension={dimension} projectSlug={projectSlug} />
          ))}
          {efficiency ? <EfficiencySection dimension={efficiency} projectSlug={projectSlug} /> : null}
          <SafetyPanel safety={snapshot.safety} projectSlug={projectSlug} />
        </div>
      </div>
    </Layout>
  )
}
