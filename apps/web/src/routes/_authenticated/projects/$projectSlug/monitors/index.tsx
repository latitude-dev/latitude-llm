import { Button, Icon, Input, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { LockIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { MonitorsEmptyState } from "./-components/monitors-empty-state.tsx"

function MonitorsBreadcrumb() {
  return <BreadcrumbText variant="current">Monitors</BreadcrumbText>
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/")({
  staticData: {
    breadcrumb: MonitorsBreadcrumb,
  },
  component: MonitorsPage,
})

function MonitorsPage() {
  const monitorsEnabled = useHasFeatureFlag("monitors")

  if (!monitorsEnabled) {
    return (
      <Layout>
        <Layout.Content>
          <FeatureFlagOffSplash />
        </Layout.Content>
      </Layout>
    )
  }

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem>
              <div className="relative">
                <Input
                  value=""
                  onChange={() => {}}
                  placeholder="Search monitors"
                  size="sm"
                  className="w-64 pl-8 rounded-lg"
                  disabled
                />
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </Layout.ActionRowItem>
            <Layout.ActionRowItem>
              <Button size="sm" disabled>
                <Icon icon={PlusIcon} size="sm" />
                New monitor
              </Button>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <MonitorsEmptyState />
      </Layout.Content>
    </Layout>
  )
}

function FeatureFlagOffSplash() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={LockIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>Monitors aren't available yet</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            This feature is rolling out gradually. Reach out to support if you'd like early access for your
            organization.
          </Text.H5>
        </div>
      </div>
    </div>
  )
}
