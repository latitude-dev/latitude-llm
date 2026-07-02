import { Button, Text } from "@repo/ui"
import { lazy, Suspense } from "react"
import { TelemetryHelpAlert, TraceTail } from "../mocks/trace-tail.tsx"
import { TelemetryInstructions } from "./telemetry-instructions.tsx"

const OnboardingWaitingLottie = lazy(() => import("../../onboarding-waiting-lottie.tsx"))

export function Left({
  traceReceived,
  projectSlug,
  sampleProjectSlug,
  onBack,
  onOpenSampleProject,
}: {
  readonly traceReceived: boolean
  readonly projectSlug: string
  readonly sampleProjectSlug: string | undefined
  readonly onBack: () => void
  readonly onOpenSampleProject: () => void
}) {
  const heading = traceReceived ? "Trace received. Redirecting…" : "Set up your first project"
  const subheading = traceReceived ? "Taking you to your traces…" : "Initiate your first project on Latitude"

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="h-8 w-8 overflow-hidden rounded-md">
            <Suspense fallback={<div className="h-8 w-8 shrink-0" aria-hidden />}>
              <OnboardingWaitingLottie />
            </Suspense>
          </div>
          <div className="flex flex-col gap-2">
            <Text.H2 weight="medium">{heading}</Text.H2>
            <Text.H4 color="foregroundMuted">{subheading}</Text.H4>
          </div>
        </div>

        <TelemetryInstructions projectSlug={projectSlug} />

        <div className="flex flex-row flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          {sampleProjectSlug ? (
            <Button variant="ghost" onClick={onOpenSampleProject}>
              Explore sample project
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function Right({ traceReceived }: { readonly traceReceived: boolean }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col self-stretch">
      <div className="mx-auto flex w-full max-w-[448px] flex-1 flex-col justify-center">
        <TraceTail traceReceived={traceReceived} />
      </div>
      {!traceReceived ? (
        <div className="mx-auto w-full max-w-[448px] shrink-0 -mb-10 lg:-mb-16">
          <TelemetryHelpAlert />
        </div>
      ) : null}
    </div>
  )
}
