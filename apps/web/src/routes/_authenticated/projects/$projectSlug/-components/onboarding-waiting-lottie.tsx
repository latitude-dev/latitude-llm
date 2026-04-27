import "@lottiefiles/dotlottie-wc"
import type { ElementType } from "react"

const DotLottieWc = "dotlottie-wc" as ElementType

const WAITING_LOTTIE_SRC = "https://lottie.host/40f19b57-50b7-4419-afb3-a8bb2b8623c8/nr6mmYVplZ.lottie"

export default function OnboardingWaitingLottie() {
  return <DotLottieWc className="block h-8 w-8" src={WAITING_LOTTIE_SRC} autoplay loop />
}
