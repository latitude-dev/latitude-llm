import type { ReactElement, SVGProps } from "react"
import type { DestinationRecord } from "../../../../../../../domains/destinations/destinations.functions.ts"
import { PosthogLogo } from "./posthog.tsx"

type DestinationLogoComponent = (props: SVGProps<SVGSVGElement>) => ReactElement

/** Per-kind brand logos. Exhaustive over `DestinationKind` so a new kind must add its mark here. */
const DESTINATION_LOGOS: Record<DestinationRecord["kind"], DestinationLogoComponent> = {
  posthog: PosthogLogo,
}

export function DestinationLogo({
  kind,
  className,
}: {
  readonly kind: DestinationRecord["kind"]
  readonly className?: string
}) {
  const Logo = DESTINATION_LOGOS[kind]
  return <Logo className={className} />
}
