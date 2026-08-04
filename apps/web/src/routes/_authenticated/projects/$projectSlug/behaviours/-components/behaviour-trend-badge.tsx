import type { TaxonomyClusterTrendStatus } from "@domain/taxonomy"
import { Icon } from "@repo/ui"
import { ArrowDownIcon, ArrowUpIcon, FlameIcon, type LucideProps, MinusIcon, SparklesIcon } from "lucide-react"
import type { ComponentType } from "react"

/** Shared by the full behavior tree (`behaviours-view.tsx`) and the catalog card teaser. */
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

export const trendIcon = (status: TaxonomyClusterTrendStatus): ComponentType<LucideProps> => {
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

export function BehaviourBadge({ label, icon }: { readonly label: string; readonly icon: ComponentType<LucideProps> }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-xs leading-5 text-muted-foreground">
      <Icon icon={icon} size="xs" color="foregroundMuted" />
      <span className="truncate">{label}</span>
    </span>
  )
}
