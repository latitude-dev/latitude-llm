import { Button, Text } from "@repo/ui"
import { lazy, Suspense } from "react"
import { TraceTail } from "../mocks/trace-tail.tsx"
import type { StackChoice } from "./stack-step.tsx"
import { TelemetryInstructions } from "./telemetry-instructions.tsx"

const OnboardingWaitingLottie = lazy(() => import("../../onboarding-waiting-lottie.tsx"))

export function Left({
  stackChoice,
  traceReceived,
  projectSlug,
  onBack,
  onSkip,
}: {
  readonly stackChoice: StackChoice | null
  readonly traceReceived: boolean
  readonly projectSlug: string
  readonly onBack: () => void
  readonly onSkip: () => void
}) {
  const isProductionAgent = stackChoice === "production-agent"
  const heading = isProductionAgent
    ? traceReceived
      ? "Trace received. Redirecting…"
      : "Set up your first project"
    : traceReceived
      ? "Trace received. Redirecting…"
      : "Install the plugin"
  const subheading = isProductionAgent
    ? traceReceived
      ? "Taking you to your traces…"
      : "Initiate your first project on Latitude"
    : traceReceived
      ? "Taking you to your traces…"
      : "Set up Latitude telemetry for your agent in one command"

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

        <TelemetryInstructions stackChoice={stackChoice} projectSlug={projectSlug} />

        <div className="flex flex-row flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Right({ traceReceived }: { readonly traceReceived: boolean }) {
  return <TraceTail traceReceived={traceReceived} />
}
