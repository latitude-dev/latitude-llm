import type { TaxonomyClusterTrendStatus } from "@domain/taxonomy"
import { Badge } from "@repo/ui"
import { ArrowDownIcon, ArrowUpIcon, FlameIcon, type LucideIcon, MinusIcon, SparklesIcon } from "lucide-react"

export const trendLabel = (status: TaxonomyClusterTrendStatus): string => {
  switch (status) {
    case "new":
      return "new"
    case "spike":
      return "spiking"
    case "rising":
      return "rising"
    case "steady":
      return "steady"
    case "cooling":
      return "cooling"
    case "fading":
      return "fading"
  }
}

export const trendIcon = (status: TaxonomyClusterTrendStatus) => {
  switch (status) {
    case "new":
      return SparklesIcon
    case "spike":
      return FlameIcon
    case "rising":
      return ArrowUpIcon
    case "cooling":
    case "fading":
      return ArrowDownIcon
    case "steady":
      return MinusIcon
  }
}

/**
 * The pill used for a behavior's status badges (parent, sessions, trend, first
 * seen, facet timing), on the tree, the catalog, and the facet header alike —
 * the app's shared `Badge`, not a bespoke one, so it stays in step with every
 * other badge in the product.
 */
export function BehaviourBadge({ label, icon }: { readonly label: string; readonly icon: LucideIcon }) {
  return (
    <Badge variant="outlineMuted" shape="rounded" ellipsis iconProps={{ icon, placement: "start" }}>
      {label}
    </Badge>
  )
}
