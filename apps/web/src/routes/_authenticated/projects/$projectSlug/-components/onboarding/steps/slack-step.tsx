import { Button, Icon, SlackIcon, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import {
  getActiveSlackIntegration,
  type SlackIntegrationRecord,
} from "../../../../../../../domains/integrations/integrations.functions.ts"
import { IntegrationCard } from "../../../settings/-components/integration-card.tsx"
import { SLACK_INTEGRATION_QUERY_KEY, SlackRouteRow } from "../../../settings/-components/slack-route-row.tsx"
import { MockSlackQueue } from "../mocks/mock-slack-queue.tsx"

export function Left({
  projectSlug,
  onBack,
  onContinue,
}: {
  readonly projectSlug: string
  readonly onBack: () => void
  readonly onContinue: () => void
}) {
  const { data: integration, isLoading } = useQuery({
    queryKey: SLACK_INTEGRATION_QUERY_KEY,
    queryFn: () => getActiveSlackIntegration(),
  })
  const connected = integration != null
  // CTA reflects routing, not just connection — no route = nothing gets delivered.
  const incidentsConfigured = (integration?.routes.incidents?.length ?? 0) > 0

  const returnTo = `/projects/${projectSlug}/onboarding?step=slack`
  const connectHref = `/integrations/slack/install?return_to=${encodeURIComponent(returnTo)}`

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="h-8 w-8">
            <img src="/favicon.svg" alt="Latitude" className="h-8 w-8" />
          </div>
          <div className="flex flex-col gap-2">
            <Text.H2 weight="medium">Get notified in Slack</Text.H2>
            <Text.H4 color="foregroundMuted">
              Connect your workspace so Flaggers can alert your team the moment they detect an issue.
            </Text.H4>
          </div>
        </div>

        {isLoading ? null : connected ? (
          <SlackConnectedOnboardingCard integration={integration} />
        ) : (
          <IntegrationCard
            icon={SlackIcon}
            title="Slack"
            subtitle="Send Latitude notifications to your Slack workspace."
            actions={
              // Server-handler route — needs full-page nav, not `<Link>` client routing.
              <Button asChild>
                <a href={connectHref}>Connect Slack</a>
              </Button>
            }
          />
        )}

        <div className="flex flex-row flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          {incidentsConfigured ? (
            <Button onClick={onContinue}>Continue</Button>
          ) : (
            <Button variant="ghost" onClick={onContinue}>
              Skip for now
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function SlackConnectedOnboardingCard({ integration }: { readonly integration: SlackIntegrationRecord }) {
  const hasAnyRoute =
    (integration.routes.incidents?.length ?? 0) > 0 ||
    (integration.routes.wrapped_reports?.length ?? 0) > 0 ||
    (integration.routes.custom_messages?.length ?? 0) > 0

  const showWrapped = hasAnyRoute || (integration.routes.wrapped_reports?.length ?? 0) > 0
  const showCustom = hasAnyRoute || (integration.routes.custom_messages?.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-border">
        <div className="flex flex-row items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon icon={SlackIcon} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H5 weight="semibold">{integration.teamName}</Text.H5>
            <Text.H6 color="foregroundMuted">Connected {relativeTime(new Date(integration.installedAt))}</Text.H6>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-4">
          <SlackRouteRow group="incidents" integration={integration} />
          {showWrapped ? <SlackRouteRow group="wrapped_reports" integration={integration} /> : null}
          {showCustom ? <SlackRouteRow group="custom_messages" integration={integration} /> : null}
        </div>
      </div>
      <Text.H6 color="foregroundMuted">You can change these anytime in Settings → Integrations.</Text.H6>
    </div>
  )
}

export function Right({ isActive }: { readonly isActive: boolean }) {
  return <MockSlackQueue isActive={isActive} />
}
