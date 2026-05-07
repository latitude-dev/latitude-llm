import "@lottiefiles/dotlottie-wc"
import type { ElementType } from "react"

const DotLottieWc = "dotlottie-wc" as ElementType

const ISSUES_LOTTIE_SRC =
  "https://lottie.host/e823aaf3-84b6-4826-a141-88728e9d606a/hT4tVQRrqu.lottie"

export default function IssuesLottie() {
  return (
    <DotLottieWc className="block h-5 w-5 shrink-0" src={ISSUES_LOTTIE_SRC} autoplay loop />
  )
}
