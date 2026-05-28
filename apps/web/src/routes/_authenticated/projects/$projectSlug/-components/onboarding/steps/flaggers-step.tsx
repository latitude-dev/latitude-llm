import { Button, cn, Icon, Text } from "@repo/ui"
import { Check } from "lucide-react"
import { useMemo } from "react"
import {
  FLAGGER_ONBOARDING_ORDER,
  FLAGGER_USE_CASE_PRESETS,
  type FlaggerPresetSlug,
} from "../../../../../../../domains/flaggers/presets.ts"
import { MockIssuesFeed } from "../mocks/mock-issues-feed.tsx"

type AvailableFlagger = {
  readonly slug: string
  readonly name: string
  readonly description: string
}

export function Left({
  availableFlaggers,
  isLoadingAvailableFlaggers,
  isLoadingProjectFlaggers,
  enabledFlaggerSlugs,
  toggleFlaggerSelection,
  applyFlaggerPreset,
  isSavingFlaggers,
  onBack,
  onContinue,
}: {
  readonly availableFlaggers: ReadonlyArray<AvailableFlagger>
  readonly isLoadingAvailableFlaggers: boolean
  readonly isLoadingProjectFlaggers: boolean
  readonly enabledFlaggerSlugs: ReadonlySet<string>
  readonly toggleFlaggerSelection: (slug: string) => void
  readonly applyFlaggerPreset: (enabledSlugs: ReadonlyArray<FlaggerPresetSlug>) => void
  readonly isSavingFlaggers: boolean
  readonly onBack: () => void
  readonly onContinue: () => void
}) {
  const sortedAvailableFlaggers = useMemo(() => {
    const indexBySlug = new Map<string, number>(FLAGGER_ONBOARDING_ORDER.map((slug, index) => [slug, index]))
    const fallbackIndex = FLAGGER_ONBOARDING_ORDER.length
    return [...availableFlaggers].sort(
      (a, b) => (indexBySlug.get(a.slug) ?? fallbackIndex) - (indexBySlug.get(b.slug) ?? fallbackIndex),
    )
  }, [availableFlaggers])

  const activePresetId =
    FLAGGER_USE_CASE_PRESETS.find(
      (preset) =>
        preset.enabledSlugs.length === enabledFlaggerSlugs.size &&
        preset.enabledSlugs.every((slug) => enabledFlaggerSlugs.has(slug)),
    )?.id ?? null

  return (
    <div className="flex w-full max-w-[880px] self-center">
      <div className="flex w-full flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="h-8 w-8">
            <img src="/favicon.svg" alt="Latitude" className="h-8 w-8" />
          </div>
          <div className="flex flex-col gap-2">
            <Text.H2 weight="medium">Choose automatic flaggers</Text.H2>
            <Text.H4 color="foregroundMuted">
              Latitude inspects all incoming traces and creates issues when they detect common failure patterns. Choose
              the patterns you want to monitor.
            </Text.H4>
            <Text.H5 color="foregroundMuted">
              You can fine-tune sampling rates per flagger later in Project settings.
            </Text.H5>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-row flex-wrap gap-2">
            {FLAGGER_USE_CASE_PRESETS.map((preset) => {
              const isActive = activePresetId === preset.id
              return (
                <Button
                  key={preset.id}
                  variant={isActive ? "default-soft" : "outline"}
                  size="sm"
                  aria-pressed={isActive}
                  onClick={() => applyFlaggerPreset(preset.enabledSlugs)}
                  title={preset.description}
                >
                  {preset.label}
                </Button>
              )
            })}
          </div>

          {isLoadingAvailableFlaggers || isLoadingProjectFlaggers ? (
            <Text.H5 color="foregroundMuted">Loading flaggers…</Text.H5>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
              {sortedAvailableFlaggers.map((flagger) => {
                const selected = enabledFlaggerSlugs.has(flagger.slug)
                return (
                  <button
                    key={flagger.slug}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleFlaggerSelection(flagger.slug)}
                    className={cn(
                      "group flex min-h-[132px] w-full cursor-pointer flex-col justify-between gap-4 rounded-xl border p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/10",
                      {
                        "border-primary bg-primary-muted/40 ring-1 ring-primary/20": selected,
                        "border-border bg-card": !selected,
                      },
                    )}
                  >
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Text.H5M>{flagger.name}</Text.H5M>
                      <Text.H6 color="foregroundMuted">{flagger.description}</Text.H6>
                    </div>
                    <div className="flex flex-row justify-end">
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                          {
                            "border-primary bg-primary text-primary-foreground": selected,
                            "border-border bg-background text-transparent group-hover:border-primary/40": !selected,
                          },
                        )}
                      >
                        <Icon icon={Check} size="sm" />
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-row flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button
            disabled={isLoadingAvailableFlaggers || availableFlaggers.length === 0 || isSavingFlaggers}
            onClick={onContinue}
          >
            {isSavingFlaggers ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Right({
  enabledFlaggerSlugs,
  availableFlaggers,
}: {
  readonly enabledFlaggerSlugs: ReadonlySet<string>
  readonly availableFlaggers: ReadonlyArray<AvailableFlagger>
}) {
  return <MockIssuesFeed enabledFlaggerSlugs={enabledFlaggerSlugs} availableFlaggers={availableFlaggers} />
}
