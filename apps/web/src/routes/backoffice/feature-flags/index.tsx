import { Icon, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { Flag } from "lucide-react"
import { type AdminFeatureFlagDto, adminListFeatureFlags } from "../../../domains/admin/feature-flags.functions.ts"
import { FeatureFlagRow } from "./-components/feature-flag-row.tsx"

export const Route = createFileRoute("/backoffice/feature-flags/")({
  loader: async () => {
    const featureFlags = await adminListFeatureFlags()
    return { featureFlags }
  },
  component: BackofficeFeatureFlagsPage,
})

function BackofficeFeatureFlagsPage() {
  const { featureFlags } = Route.useLoaderData() as {
    readonly featureFlags: AdminFeatureFlagDto[]
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-8 pb-12">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon icon={Flag} size="sm" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text.H4 weight="semibold">Feature Flags</Text.H4>
            <Text.H6 color="foregroundMuted">
              Flags are declared in code. Toggle them globally or per organization here.
            </Text.H6>
          </div>
        </div>
      </div>

      {featureFlags.length === 0 ? (
        <EmptyFeatureFlagsState />
      ) : (
        <div className="flex flex-col gap-2">
          {featureFlags.map((featureFlag) => (
            <FeatureFlagRow key={featureFlag.identifier} featureFlag={featureFlag} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyFeatureFlagsState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon={Flag} size="default" />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <Text.H5 weight="medium">No feature flags declared</Text.H5>
        <Text.H6 color="foregroundMuted">
          Add an entry to the FEATURE_FLAGS registry in @domain/feature-flags to make a new flag appear here.
        </Text.H6>
      </div>
    </div>
  )
}
