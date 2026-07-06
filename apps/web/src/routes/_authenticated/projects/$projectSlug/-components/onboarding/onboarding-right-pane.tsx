import type { ComponentProps } from "react"
import type { OnboardingStep } from "../onboarding-flow.tsx"
import { CarouselSlide, CarouselTrack } from "./carousel-track.tsx"
import { OnboardingGallery } from "./onboarding-gallery.tsx"
import * as FlaggersStep from "./steps/flaggers-step.tsx"
import * as SlackStep from "./steps/slack-step.tsx"
import * as TelemetryStep from "./steps/telemetry-step.tsx"

type RightSlide = "intro" | "flaggers" | "slack" | "telemetry"

const STEP_TO_RIGHT_SLIDE: Record<OnboardingStep, RightSlide> = {
  role: "intro",
  flaggers: "flaggers",
  slack: "slack",
  telemetry: "telemetry",
}

// The step visuals live here, not as a prop on the step components — a flow that renders
// only `Step.Left` gets no illustrations, so every onboarding flow must mount this pane too.
export function OnboardingRightPane({
  steps,
  currentStep,
  enabledFlaggerSlugs,
  availableFlaggers,
  traceReceived = false,
}: {
  readonly steps: ReadonlyArray<OnboardingStep>
  readonly currentStep: OnboardingStep
  readonly enabledFlaggerSlugs: ComponentProps<typeof FlaggersStep.Right>["enabledFlaggerSlugs"]
  readonly availableFlaggers: ComponentProps<typeof FlaggersStep.Right>["availableFlaggers"]
  readonly traceReceived?: boolean
}) {
  const visibleRightSlides = steps.map((step) => STEP_TO_RIGHT_SLIDE[step])
  const activeRightSlideIndex = Math.max(0, steps.indexOf(currentStep))

  return (
    <div className="hidden h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden bg-secondary lg:flex lg:w-1/2">
      <CarouselTrack activeIndex={activeRightSlideIndex}>
        {visibleRightSlides.map((slide) => (
          <CarouselSlide key={slide}>
            {slide === "intro" ? (
              <OnboardingGallery />
            ) : slide === "flaggers" ? (
              <FlaggersStep.Right enabledFlaggerSlugs={enabledFlaggerSlugs} availableFlaggers={availableFlaggers} />
            ) : slide === "slack" ? (
              <SlackStep.Right isActive={currentStep === "slack"} />
            ) : (
              <TelemetryStep.Right traceReceived={traceReceived} />
            )}
          </CarouselSlide>
        ))}
      </CarouselTrack>
    </div>
  )
}
